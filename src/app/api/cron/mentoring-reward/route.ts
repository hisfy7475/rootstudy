import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MENTORING_REWARD } from '@/lib/constants';
import { formatDate, getStudyDate, mentoringSlotStartMs } from '@/lib/utils';
import { notifyPointsGranted } from '@/lib/actions/notification';
import type { MentoringRewardSkipReason } from '@/types/database';

// 멘토링·상담 참여 자동 상점 크론 (KST 09:00 = UTC 00:00, "0 0 * * *")
//
// 확정(confirmed) 신청 1건당 상점 1점 — 세션당 부여.
//
// 왜 09:00 인가:
//   03:00(daily-reset) 에 붙이면 취침 중 푸시가 되어 알림을 별도 크론으로 분리해야 하는데,
//   기존 09:00 알림 크론은 daily_focus_evaluations 테이블에 묶여 재사용이 안 된다.
//   09:00 독립 크론이면 부여와 알림이 한 흐름에 들어가고, 저녁 슬롯(최대 22:40 종료) 기준
//   10시간 이상의 노쇼 정리 유예도 확보된다.
//
// 멱등:
//   mentoring_reward_grants (application_id PK) 원장이 단독으로 책임진다.
//   points 의 unique 인덱스는 학생 전배·슬롯 날짜 수정·프리셋 재생성·상점 물리삭제에
//   전부 뚫리므로 의존하지 않는다. 원장은 claim-first(ON CONFLICT DO NOTHING)로
//   크론 중복 실행 동시성까지 함께 막는다.
//
// 소급 창:
//   관리자의 사후 확정·대리등록은 크론이 지나간 뒤에 일어나므로 하루치만 보면 영구 누락된다.
//   어제 ~ 어제-6일(7일)을 매번 다시 훑고, 원장이 중복을 막는다.

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
/** IN (...) 절 분할 단위 — URL 길이 초과 방지 */
const CHUNK = 200;
/** outOfWindow 관측 시 소급 창 이전으로 거슬러 볼 범위(일) */
const OUT_OF_WINDOW_PROBE_DAYS = 30;

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** YYYY-MM-DD 문자열 날짜 산술 (UTC 자정 기준이라 DST 영향 없음) */
function shiftYmd(ymd: string, days: number): string {
  return formatDate(new Date(new Date(`${ymd}T00:00:00Z`).getTime() + days * ONE_DAY_MS));
}

type SlotRow = { id: string; date: string; start_time: string };
type AppRow = { id: string; slot_id: string; student_id: string };

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 컷오버 상수 가드.
  // placeholder('2026-__-__' 등)가 남으면 '_'(0x5F) > 숫자라 문자열 비교에서 항상 이겨
  // 에러 없이 조용히 0건 처리된다. 배포 사고를 막기 위해 명시적으로 실패시킨다.
  const startDate = MENTORING_REWARD.startDate as string;
  if (!YMD_RE.test(startDate)) {
    return NextResponse.json(
      {
        success: false,
        error: `MENTORING_REWARD.startDate 가 YYYY-MM-DD 형식이 아닙니다: "${startDate}". 배포 전 컷오버 날짜를 확정하세요.`,
      },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const isBackfill = Boolean(fromParam || toParam);
  // 백필은 과거분 푸시가 폭주하므로 notify 기본값을 false 로 뒤집는다.
  const notify = isBackfill
    ? url.searchParams.get('notify') === 'true'
    : url.searchParams.get('notify') !== 'false';

  if ((fromParam && !YMD_RE.test(fromParam)) || (toParam && !YMD_RE.test(toParam))) {
    return NextResponse.json(
      { success: false, error: 'from/to 는 YYYY-MM-DD 형식이어야 합니다.' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  try {
    // ── 대상 학습일 범위 ────────────────────────────────────
    // 상한 = 막 끝난 학습일(어제). KST 09:00 시점 getStudyDate(now)=오늘 → -1일.
    // 슬롯은 최대 22:40 에 끝나므로 어제 슬롯은 모두 종료된 상태다.
    const yesterdayStr = formatDate(new Date(getStudyDate(new Date()).getTime() - ONE_DAY_MS));

    let toStr = toParam ?? yesterdayStr;
    let fromStr = fromParam ?? shiftYmd(toStr, -(MENTORING_REWARD.lookbackDays - 1));

    // clamp — 백필 경로에도 반드시 적용한다.
    //  · 하한: 컷오버 이전은 관리자가 수동 부여를 마친 구간. 넘어가면 이중 지급이 되고
    //    수동 부여분은 preset 이 다르고 study_date 도 NULL 이라 DB 가 막아주지 못한다.
    //  · 상한: 아직 진행되지 않은 슬롯에 미리 부여되는 것을 막는다.
    if (fromStr < startDate) fromStr = startDate;
    if (toStr > yesterdayStr) toStr = yesterdayStr;

    const base = {
      from: fromStr,
      to: toStr,
      startDate,
      dryRun,
      notify,
    };

    if (fromStr > toStr) {
      return NextResponse.json({
        success: true,
        ...base,
        candidates: 0,
        granted: 0,
        skippedAlreadyGranted: 0,
        skippedInactiveStudent: 0,
        skippedNoPreset: 0,
        skippedClaimRace: 0,
        outOfWindowCandidates: 0,
        errors: 0,
        note: '유효 범위 없음 (컷오버 이전이거나 대상 학습일이 아직 없음)',
      });
    }

    // ── 1. 범위 내 활성 슬롯 ────────────────────────────────
    const { data: slotRows, error: slotErr } = await supabase
      .from('mentoring_slots')
      .select('id, date, start_time')
      .gte('date', fromStr)
      .lte('date', toStr)
      .eq('is_active', true);
    if (slotErr) throw new Error(`slots: ${slotErr.message}`);

    const slots = (slotRows ?? []) as SlotRow[];
    const slotById = new Map(slots.map((s) => [s.id, s]));

    // ── 2. 확정 신청 ────────────────────────────────────────
    const apps: AppRow[] = [];
    for (const ids of chunked(
      slots.map((s) => s.id),
      CHUNK,
    )) {
      const { data, error } = await supabase
        .from('mentoring_applications')
        .select('id, slot_id, student_id')
        .in('slot_id', ids)
        .eq('status', 'confirmed');
      if (error) throw new Error(`applications: ${error.message}`);
      apps.push(...((data ?? []) as AppRow[]));
    }

    // ── 3. 원장에 이미 있는 건 제외 ─────────────────────────
    const handled = new Set<string>();
    for (const ids of chunked(
      apps.map((a) => a.id),
      CHUNK,
    )) {
      const { data, error } = await supabase
        .from('mentoring_reward_grants')
        .select('application_id')
        .in('application_id', ids);
      if (error) throw new Error(`grants: ${error.message}`);
      for (const r of data ?? []) handled.add(r.application_id as string);
    }
    const pending = apps.filter((a) => !handled.has(a.id));

    // ── 4. 소급 창 밖 미처리 확정 건 관측 ───────────────────
    // 창을 벗어나면 아무 로그 없이 영구 누락되므로 개수만 세어 응답에 노출한다.
    let outOfWindowCandidates = 0;
    {
      const probeFrom = (() => {
        const p = shiftYmd(fromStr, -OUT_OF_WINDOW_PROBE_DAYS);
        return p < startDate ? startDate : p;
      })();
      const probeTo = shiftYmd(fromStr, -1);
      if (probeFrom <= probeTo) {
        const { data: oldSlots } = await supabase
          .from('mentoring_slots')
          .select('id')
          .gte('date', probeFrom)
          .lte('date', probeTo)
          .eq('is_active', true);
        const oldIds = (oldSlots ?? []).map((s) => s.id as string);
        const oldAppIds: string[] = [];
        for (const ids of chunked(oldIds, CHUNK)) {
          const { data } = await supabase
            .from('mentoring_applications')
            .select('id')
            .in('slot_id', ids)
            .eq('status', 'confirmed');
          oldAppIds.push(...(data ?? []).map((a) => a.id as string));
        }
        const oldHandled = new Set<string>();
        for (const ids of chunked(oldAppIds, CHUNK)) {
          const { data } = await supabase
            .from('mentoring_reward_grants')
            .select('application_id')
            .in('application_id', ids);
          for (const r of data ?? []) oldHandled.add(r.application_id as string);
        }
        outOfWindowCandidates = oldAppIds.filter((id) => !oldHandled.has(id)).length;
      }
    }

    // ── 5. 학생 정보 / 프리셋 prefetch ──────────────────────
    const studentIds = Array.from(new Set(pending.map((a) => a.student_id)));

    const profileMap = new Map<
      string,
      {
        name: string | null;
        branchId: string | null;
        withdrawnAt: string | null;
        approved: boolean;
      }
    >();
    for (const ids of chunked(studentIds, CHUNK)) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, branch_id, withdrawn_at, is_approved')
        .in('id', ids);
      if (error) throw new Error(`profiles: ${error.message}`);
      for (const p of data ?? []) {
        profileMap.set(p.id as string, {
          name: (p.name as string | null) ?? null,
          branchId: (p.branch_id as string | null) ?? null,
          withdrawnAt: (p.withdrawn_at as string | null) ?? null,
          approved: Boolean(p.is_approved),
        });
      }
    }

    // points.student_id 는 student_profiles(id) FK 인데
    // mentoring_applications.student_id 는 profiles(id) FK 라 대상이 다르다.
    // 학부모·관리자 계정이 대리등록되면 23503 으로 터지므로 사전에 걸러낸다.
    const hasStudentProfile = new Set<string>();
    for (const ids of chunked(studentIds, CHUNK)) {
      const { data, error } = await supabase.from('student_profiles').select('id').in('id', ids);
      if (error) throw new Error(`student_profiles: ${error.message}`);
      for (const s of data ?? []) hasStudentProfile.add(s.id as string);
    }

    // 프리셋은 code 로만 조회한다. is_active 를 걸면 관리자가 실수로 비활성화했을 때
    // 부여가 조용히 멈춘다 (daily-reset 의 daily_focus 조회와 동일한 이유).
    const { data: presetRows, error: presetErr } = await supabase
      .from('reward_presets')
      .select('id, branch_id')
      .eq('code', MENTORING_REWARD.presetCode);
    if (presetErr) throw new Error(`reward_presets: ${presetErr.message}`);
    const presetByBranch = new Map<string, string>(
      (presetRows ?? []).map((p) => [p.branch_id as string, p.id as string]),
    );

    // ── dry-run ─────────────────────────────────────────────
    if (dryRun) {
      const preview = pending.map((a) => {
        const slot = slotById.get(a.slot_id)!;
        const prof = profileMap.get(a.student_id);
        const presetId = prof?.branchId ? presetByBranch.get(prof.branchId) : undefined;
        const reason: MentoringRewardSkipReason | null = !prof
          ? 'no_student_profile'
          : prof.withdrawnAt
            ? 'withdrawn'
            : !prof.approved
              ? 'not_approved'
              : !hasStudentProfile.has(a.student_id)
                ? 'no_student_profile'
                : !presetId
                  ? 'no_preset'
                  : null;
        return {
          applicationId: a.id,
          studentId: a.student_id,
          studentName: prof?.name ?? null,
          slotDate: slot.date,
          studyDate: formatDate(
            getStudyDate(new Date(mentoringSlotStartMs(slot.date, slot.start_time))),
          ),
          willGrant: reason === null,
          skipReason: reason,
        };
      });
      return NextResponse.json({
        success: true,
        ...base,
        candidates: pending.length,
        wouldGrant: preview.filter((p) => p.willGrant).length,
        skippedAlreadyGranted: handled.size,
        outOfWindowCandidates,
        preview,
      });
    }

    // ── 6. 건별 처리 ────────────────────────────────────────
    let granted = 0;
    let skippedInactiveStudent = 0;
    let skippedNoPreset = 0;
    let skippedClaimRace = 0;
    let errors = 0;

    for (const app of pending) {
      const slot = slotById.get(app.slot_id);
      if (!slot) continue;

      // 슬롯 시작 시각이 속한 학습일. slot.date 를 그대로 쓰지 않는 이유는
      // 슬롯 시각 검증이 시작<종료 뿐이라 00:00~06:00 슬롯이 생기면 하루 어긋나기 때문.
      const studyDate = formatDate(
        getStudyDate(new Date(mentoringSlotStartMs(slot.date, slot.start_time))),
      );

      try {
        // claim-first: 원장 선점. 이미 있으면 0행 → 다른 실행이 처리 중/완료.
        const { data: claimed, error: claimErr } = await supabase
          .from('mentoring_reward_grants')
          .upsert(
            {
              application_id: app.id,
              student_id: app.student_id,
              study_date: studyDate,
              granted: false,
            },
            { onConflict: 'application_id', ignoreDuplicates: true },
          )
          .select('application_id');
        if (claimErr) throw claimErr;
        if (!claimed || claimed.length === 0) {
          skippedClaimRace++;
          continue;
        }

        // 학생 유효성
        const prof = profileMap.get(app.student_id);
        let skipReason: MentoringRewardSkipReason | null = null;
        if (!prof) skipReason = 'no_student_profile';
        else if (prof.withdrawnAt) skipReason = 'withdrawn';
        else if (!prof.approved) skipReason = 'not_approved';
        else if (!hasStudentProfile.has(app.student_id)) skipReason = 'no_student_profile';

        const presetId = prof?.branchId ? (presetByBranch.get(prof.branchId) ?? null) : null;
        if (!skipReason && !presetId) skipReason = 'no_preset';

        if (skipReason) {
          // 정책상 미부여 — 확정 기록으로 남긴다(재시도 불필요).
          await supabase
            .from('mentoring_reward_grants')
            .update({ granted: false, skip_reason: skipReason })
            .eq('application_id', app.id);
          if (skipReason === 'no_preset') {
            skippedNoPreset++;
            console.error('[mentoring-reward] preset 없음', {
              applicationId: app.id,
              branchId: prof?.branchId,
            });
          } else {
            skippedInactiveStudent++;
          }
          continue;
        }

        const { data: point, error: pointErr } = await supabase
          .from('points')
          .insert({
            student_id: app.student_id,
            admin_id: null,
            type: 'reward',
            amount: MENTORING_REWARD.amount,
            reason: MENTORING_REWARD.reason,
            is_auto: true,
            event_kind: 'auto_mentoring',
            study_date: studyDate,
            preset_id: presetId,
            preset_type: 'reward',
          })
          .select('id')
          .maybeSingle();

        if (pointErr || !point) {
          // 일시적 실패로 보고 원장 선점을 풀어 다음 실행에서 재시도되게 한다.
          await supabase.from('mentoring_reward_grants').delete().eq('application_id', app.id);
          console.error('[mentoring-reward] points insert 실패', app.id, pointErr);
          errors++;
          continue;
        }

        await supabase
          .from('mentoring_reward_grants')
          .update({ point_id: point.id as string, granted: true, skip_reason: null })
          .eq('application_id', app.id);
        granted++;

        if (notify) {
          await notifyPointsGranted(
            {
              studentId: app.student_id,
              type: 'reward',
              amount: MENTORING_REWARD.amount,
              reason: MENTORING_REWARD.reason,
              studentName: prof?.name ?? undefined,
            },
            { awaitPush: true },
          ).catch((e) => console.error('[mentoring-reward] notify 실패', app.id, e));
        }
      } catch (e) {
        console.error('[mentoring-reward] 처리 실패', app.id, e);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      ...base,
      candidates: pending.length,
      granted,
      skippedAlreadyGranted: handled.size,
      skippedInactiveStudent,
      skippedNoPreset,
      skippedClaimRace,
      outOfWindowCandidates,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[mentoring-reward] cron error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
