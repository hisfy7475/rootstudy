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

    const { data: students } = await supabase
      .from('student_profiles')
      .select('id, caps_id, caps_id_set_at')
      .in('caps_id', capsIds);

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

    // 6. 출입 기록 처리
    const attendanceRecords: {
      student_id: string;
      type: 'check_in' | 'check_out';
      timestamp: string;
      source: 'caps';
    }[] = [];

    for (const record of enterRecords) {
      const student = studentMap.get(String(record.e_id));
      if (!student) {
        // 매칭되는 학생 없음 - 스킵
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

      // caps_id 설정(승인) 시점 이전의 기록은 무시
      if (student.capsIdSetAt && timestamp < student.capsIdSetAt) {
        continue;
      }

      attendanceRecords.push({
        student_id: student.studentId,
        type: attendanceType,
        timestamp,
        source: 'caps',
      });

      // 마지막 처리된 CAPS datetime 업데이트
      const currentDatetime = getCapsDatetimeString(record.e_date, record.e_time);
      if (!lastCapsDatetime || currentDatetime > lastCapsDatetime) {
        lastCapsDatetime = currentDatetime;
      }
    }

    // 7. attendance 테이블에 저장 (중복 방지)
    if (attendanceRecords.length > 0) {
      // 중복 체크를 위해 기존 기록 조회
      const timestamps = attendanceRecords.map((r) => r.timestamp);
      const studentIds = [...new Set(attendanceRecords.map((r) => r.student_id))];

      const { data: existingRecords } = await supabase
        .from('attendance')
        .select('student_id, timestamp')
        .in('student_id', studentIds)
        .in('timestamp', timestamps)
        .eq('source', 'caps');

      const existingSet = new Set(
        existingRecords?.map((r) => `${r.student_id}_${r.timestamp}`) || []
      );

      // 중복 제외하고 삽입
      const newRecords = attendanceRecords.filter(
        (r) => !existingSet.has(`${r.student_id}_${r.timestamp}`)
      );

      if (newRecords.length > 0) {
        const { error: insertError } = await supabase
          .from('attendance')
          .insert(newRecords);

        if (insertError) {
          throw new Error(`Failed to insert attendance: ${insertError.message}`);
        }

        recordsSynced = newRecords.length;

        // check_out 기록이 있는 학생의 현재 과목(is_current=true) 종료
        // 학생별 가장 늦은 check_out 시간을 ended_at으로 사용
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
      }
    }

    // 8. 동기화 로그 기록
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

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
