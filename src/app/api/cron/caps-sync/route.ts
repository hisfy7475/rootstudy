import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getEnterRecordsAfter,
  getGates,
  parseCapsDatetime,
  getCapsDatetimeString,
  closeConnection,
} from '@/lib/caps/client';
import type { CapsGate } from '@/lib/caps/types';
import { sendPushToUsers } from '@/lib/push';
import { getStudyDate } from '@/lib/utils';
import {
  evaluateAttendancePenalty,
  fetchMandatoryTime,
  type MandatoryTime,
  type PenaltyClient,
} from '@/lib/attendance/penalty';

// Supabase 서비스 롤 클라이언트 (RLS 우회)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// 출입문 이름으로 출입 타입 결정
function getAttendanceType(gateName: string): 'check_in' | 'check_out' | null {
  const name = gateName.toLowerCase();
  if (name.includes('입실')) {
    return 'check_in';
  }
  if (name.includes('퇴실')) {
    return 'check_out';
  }
  // 입실/퇴실 구분이 안 되는 경우 (루트_5F 등)는 입실로 처리
  // 또는 null로 반환하여 스킵할 수 있음
  return 'check_in';
}

export async function GET(request: Request) {
  // 1. Cron secret 검증
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  let recordsSynced = 0;
  let lastCapsDatetime: string | null = null;
  let errorMessage: string | null = null;

  try {
    // 2. 마지막 동기화 시점 조회
    const { data: lastSync } = await supabase
      .from('caps_sync_log')
      .select('last_caps_datetime')
      .eq('status', 'success')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single();

    const afterDatetime = lastSync?.last_caps_datetime || null;

    // 3. 출입문 목록 조회 (캐싱용)
    const gates = await getGates();
    const gateMap = new Map<number, CapsGate>();
    gates.forEach((gate) => gateMap.set(gate.id, gate));

    // 4. CAPS DB에서 새 출입 기록 조회
    const enterRecords = await getEnterRecordsAfter(afterDatetime);

    if (enterRecords.length === 0) {
      // 새 기록 없음
      await supabase.from('caps_sync_log').insert({
        synced_at: new Date().toISOString(),
        records_synced: 0,
        last_caps_datetime: afterDatetime,
        status: 'success',
      });

      await closeConnection();
      return NextResponse.json({
        success: true,
        message: 'No new records',
        recordsSynced: 0,
      });
    }

    // 5. caps_id(사용자ID)로 학생 매칭을 위한 학생 목록 조회
    // CAPS의 e_id(사용자ID)를 사용하여 매칭 (e_idno는 사원번호)
    const capsIds = [...new Set(enterRecords.map((r) => String(r.e_id)))];

    // 퇴원 학생(profiles.withdrawn_at IS NOT NULL)의 출입은 attendance 에 적재하지 않는다.
    // 복구 시 caps_id 는 그대로 유지되므로 즉시 정상 적재 재개.
    const { data: students } = await supabase
      .from('student_profiles')
      .select('id, caps_id, caps_id_set_at, profiles!inner(withdrawn_at)')
      .in('caps_id', capsIds)
      .is('profiles.withdrawn_at', null);

    // caps_id -> { studentId, capsIdSetAt } 매핑
    const studentMap = new Map<string, { studentId: string; capsIdSetAt: string | null }>();
    students?.forEach((s) => {
      if (s.caps_id) {
        studentMap.set(s.caps_id, {
          studentId: s.id,
          capsIdSetAt: s.caps_id_set_at,
        });
      }
    });

    // 6. 전체 레코드 기준 lastCapsDatetime 갱신 (매칭 여부 무관)
    if (enterRecords.length > 0) {
      const lastRecord = enterRecords[enterRecords.length - 1];
      lastCapsDatetime = getCapsDatetimeString(lastRecord.e_date, lastRecord.e_time);
    }

    // 7. 출입 기록 처리
    const attendanceRecords: {
      student_id: string;
      type: 'check_in' | 'check_out';
      timestamp: string;
      source: 'caps';
    }[] = [];

    for (const record of enterRecords) {
      const student = studentMap.get(String(record.e_id));
      if (!student) {
        continue;
      }

      const gate = gateMap.get(record.g_id);
      if (!gate) {
        continue;
      }

      const attendanceType = getAttendanceType(gate.name);
      if (!attendanceType) {
        continue;
      }

      const timestamp = parseCapsDatetime(record.e_date, record.e_time);

      // caps_id 설정(승인) 시점 이전의 기록은 무시 (Date 객체로 비교하여 타임존 정확 처리)
      if (student.capsIdSetAt) {
        const recordTime = new Date(timestamp);
        const setAtTime = new Date(student.capsIdSetAt);
        if (recordTime < setAtTime) {
          continue;
        }
      }

      attendanceRecords.push({
        student_id: student.studentId,
        type: attendanceType,
        timestamp,
        source: 'caps',
      });
    }

    // attendance 테이블에 저장 (중복 방지)
    if (attendanceRecords.length > 0) {
      // 타임스탬프를 UTC ISO로 정규화하는 헬퍼 (KST/UTC 형식 차이 해결)
      const normalizeTimestamp = (ts: string) => new Date(ts).toISOString();

      // 배치 내부 (student_id, timestamp) 중복 제거
      // CAPS는 한 사람이 같은 초에 여러 게이트로 찍히는 경우가 있으며,
      // 이때 idx_attendance_caps_unique 위반으로 bulk insert 전체가 실패해 동기화가 멈춘다.
      const dedupedRecords: typeof attendanceRecords = [];
      const seenInBatch = new Set<string>();
      for (const r of attendanceRecords) {
        const key = `${r.student_id}_${normalizeTimestamp(r.timestamp)}`;
        if (seenInBatch.has(key)) continue;
        seenInBatch.add(key);
        dedupedRecords.push(r);
      }

      const studentIds = [...new Set(dedupedRecords.map((r) => r.student_id))];
      const timestamps = [...new Set(dedupedRecords.map((r) => r.timestamp))];

      // 기존 기록 조회 (배치 처리로 Supabase 행 제한 대응)
      const existingSet = new Set<string>();
      const BATCH_SIZE = 50;
      for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
        const batchStudentIds = studentIds.slice(i, i + BATCH_SIZE);

        const { data: existingRecords } = await supabase
          .from('attendance')
          .select('student_id, timestamp')
          .in('student_id', batchStudentIds)
          .in('timestamp', timestamps)
          .eq('source', 'caps')
          .limit(10000);

        existingRecords?.forEach((r) => {
          existingSet.add(`${r.student_id}_${normalizeTimestamp(r.timestamp)}`);
        });
      }

      const newRecords = dedupedRecords.filter(
        (r) => !existingSet.has(`${r.student_id}_${normalizeTimestamp(r.timestamp)}`),
      );

      if (newRecords.length > 0) {
        const { error: insertError } = await supabase.from('attendance').insert(newRecords);

        if (insertError) {
          throw new Error(`Failed to insert attendance: ${insertError.message}`);
        }

        recordsSynced = newRecords.length;

        const checkOutByStudent = new Map<string, string>();
        for (const r of newRecords) {
          if (r.type === 'check_out') {
            const existing = checkOutByStudent.get(r.student_id);
            if (!existing || r.timestamp > existing) {
              checkOutByStudent.set(r.student_id, r.timestamp);
            }
          }
        }

        for (const [studentId, endedAt] of checkOutByStudent) {
          await supabase
            .from('subjects')
            .update({ is_current: false, ended_at: endedAt })
            .eq('student_id', studentId)
            .eq('is_current', true);
        }

        // 입실/퇴실 푸시 알림 + 알림 내역 적재 (학생 본인 + 연결된 학부모)
        try {
          const notifStudentIds = [...new Set(newRecords.map((r) => r.student_id))];

          const { data: studentProfiles } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', notifStudentIds);
          const studentNameMap = new Map<string, string>();
          studentProfiles?.forEach((p) => studentNameMap.set(p.id, p.name || ''));

          const { data: parentLinks } = await supabase
            .from('parent_student_links')
            .select('student_id, parent_id')
            .in('student_id', notifStudentIds);
          const studentToParents = new Map<string, string[]>();
          parentLinks?.forEach((l) => {
            const arr = studentToParents.get(l.student_id) || [];
            arr.push(l.parent_id);
            studentToParents.set(l.student_id, arr);
          });

          const kstTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });

          const studentNotifInserts: {
            student_id: string;
            type: 'system';
            title: string;
            message: string;
          }[] = [];
          const userNotifInserts: {
            user_id: string;
            type: 'system';
            title: string;
            message: string;
          }[] = [];
          const pushGroups = new Map<string, { title: string; body: string; userIds: string[] }>();

          for (const r of newRecords) {
            const studentName = studentNameMap.get(r.student_id) || '학생';
            const timeLabel = kstTimeFormatter.format(new Date(r.timestamp));
            const action = r.type === 'check_in' ? '입실' : '퇴실';

            const studentTitle = `${action} 알림`;
            const studentMessage = `${studentName} 학생, ${action} 했습니다 (${timeLabel})`;
            studentNotifInserts.push({
              student_id: r.student_id,
              type: 'system',
              title: studentTitle,
              message: studentMessage,
            });
            const studentKey = `s\u0000${studentTitle}\u0000${studentMessage}`;
            const sg = pushGroups.get(studentKey);
            if (sg) sg.userIds.push(r.student_id);
            else
              pushGroups.set(studentKey, {
                title: studentTitle,
                body: studentMessage,
                userIds: [r.student_id],
              });

            const parentIds = studentToParents.get(r.student_id) || [];
            if (parentIds.length > 0) {
              const parentTitle = `${action} 알림`;
              const parentMessage = `${studentName} 학생, ${action} 했습니다 (${timeLabel})`;
              for (const pid of parentIds) {
                userNotifInserts.push({
                  user_id: pid,
                  type: 'system',
                  title: parentTitle,
                  message: parentMessage,
                });
              }
              const parentKey = `p\u0000${parentTitle}\u0000${parentMessage}`;
              const pg = pushGroups.get(parentKey);
              if (pg) pg.userIds.push(...parentIds);
              else
                pushGroups.set(parentKey, {
                  title: parentTitle,
                  body: parentMessage,
                  userIds: [...parentIds],
                });
            }
          }

          if (studentNotifInserts.length > 0) {
            const { error: snErr } = await supabase
              .from('student_notifications')
              .insert(studentNotifInserts);
            if (snErr) console.error('[caps-sync] student_notifications insert', snErr);
          }
          if (userNotifInserts.length > 0) {
            const { error: unErr } = await supabase
              .from('user_notifications')
              .insert(userNotifInserts);
            if (unErr) console.error('[caps-sync] user_notifications insert', unErr);
          }

          await Promise.allSettled(
            [...pushGroups.values()].map((g) => sendPushToUsers(g.userIds, g.title, g.body)),
          );
        } catch (notifError) {
          console.error('[caps-sync] attendance notification error', notifError);
        }

        // 지각/조기퇴실 실시간 자동 벌점 평가 (CAPS 실제 출입 시각 기준).
        // 지점 시스템 프리셋의 auto_enabled=true 일 때만 실제 부과되며, 같은 학습일 중복은 차단된다.
        try {
          // service-role 클라이언트(비타입드)를 모듈의 타입드 클라이언트로 수용
          const penaltyClient = supabase as unknown as PenaltyClient;
          const todayStudyStr = getStudyDate(new Date()).toISOString().split('T')[0];

          const penaltyStudentIds = [...new Set(newRecords.map((r) => r.student_id))];
          const { data: penaltyProfiles } = await supabase
            .from('profiles')
            .select('id, branch_id')
            .in('id', penaltyStudentIds);
          const branchByStudent = new Map<string, string | null>();
          penaltyProfiles?.forEach((p) =>
            branchByStudent.set(p.id, (p.branch_id as string | null) ?? null),
          );

          // 의무시간 (branchId, 학습일) 캐시 — 레코드별 재조회(N+1) 방지
          const mandatoryCache = new Map<string, MandatoryTime>();
          const getMandatory = async (
            branchId: string,
            dateStr: string,
          ): Promise<MandatoryTime> => {
            const key = `${branchId}:${dateStr}`;
            const hit = mandatoryCache.get(key);
            if (hit) return hit;
            const m = await fetchMandatoryTime(penaltyClient, branchId, dateStr);
            mandatoryCache.set(key, m);
            return m;
          };

          for (const r of newRecords) {
            const at = new Date(r.timestamp);
            const studyStr = getStudyDate(at).toISOString().split('T')[0];
            // 백필/재동기화로 유입된 과거 학습일 레코드는 소급 부과하지 않음
            if (studyStr !== todayStudyStr) continue;

            const branchId = branchByStudent.get(r.student_id) ?? null;
            if (!branchId) continue;

            const mandatory = await getMandatory(branchId, studyStr);
            await evaluateAttendancePenalty({
              supabase: penaltyClient,
              studentId: r.student_id,
              type: r.type === 'check_in' ? 'late' : 'early',
              at,
              branchId,
              mandatory,
            }).catch((e) => console.error('[caps-sync] penalty eval error', e));
          }
        } catch (penaltyError) {
          console.error('[caps-sync] attendance penalty error', penaltyError);
        }
      }
    }

    // 9. 동기화 로그 기록
    await supabase.from('caps_sync_log').insert({
      synced_at: new Date().toISOString(),
      records_synced: recordsSynced,
      last_caps_datetime: lastCapsDatetime || afterDatetime,
      status: 'success',
    });

    await closeConnection();

    return NextResponse.json({
      success: true,
      message: `Synced ${recordsSynced} records`,
      recordsSynced,
      lastCapsDatetime,
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('CAPS sync error:', errorMessage);

    // 에러 로그 기록
    await supabase.from('caps_sync_log').insert({
      synced_at: new Date().toISOString(),
      records_synced: 0,
      last_caps_datetime: null,
      status: 'error',
      error_message: errorMessage,
    });

    await closeConnection();

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
