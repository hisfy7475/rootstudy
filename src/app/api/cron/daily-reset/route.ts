import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DAY_CONFIG } from '@/lib/constants';

// Supabase 서비스 롤 클라이언트 (RLS 우회)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// DAY_CONFIG 기준 익일 리셋 시각을 UTC ISO 문자열로 반환
// endHour: 25 = 다음날 01:30 KST = 당일 16:30 UTC
function getResetTimeUTC(): { hour: number; minute: number } {
  const kstEndHour = DAY_CONFIG.endHour; // 25 (다음날 01시)
  const kstEndMinute = DAY_CONFIG.endMinute; // 30
  // KST = UTC+9, endHour이 24 이상이면 다음날로 넘어간 것
  const totalKstMinutes = kstEndHour * 60 + kstEndMinute;
  const totalUtcMinutes = totalKstMinutes - 9 * 60;
  const normalizedUtcMinutes = ((totalUtcMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return {
    hour: Math.floor(normalizedUtcMinutes / 60),
    minute: normalizedUtcMinutes % 60,
  };
}

export async function GET(request: Request) {
  // Cron secret 검증
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const resetUTC = getResetTimeUTC();
  const resetAt = new Date().toISOString();

  try {
    // is_current = true 인 과목 기록 전체 조회 (로깅용)
    const { data: currentSubjects, error: fetchError } = await supabase
      .from('subjects')
      .select('id, student_id')
      .eq('is_current', true);

    if (fetchError) {
      throw new Error(`Failed to fetch current subjects: ${fetchError.message}`);
    }

    const count = currentSubjects?.length ?? 0;

    if (count === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active subjects to reset',
        resetCount: 0,
        resetAt,
        resetUTC,
      });
    }

    // 모든 is_current = true 과목을 미선택 상태로 전환
    // ended_at이 null인 경우에만 ended_at도 갱신 (진행 중이던 과목 종료 처리)
    const { error: updateError } = await supabase
      .from('subjects')
      .update({
        is_current: false,
        ended_at: resetAt,
      })
      .eq('is_current', true)
      .is('ended_at', null);

    if (updateError) {
      throw new Error(`Failed to reset subjects: ${updateError.message}`);
    }

    // ended_at이 이미 있는데 is_current만 true인 경우도 처리 (안전장치)
    const { error: updateError2 } = await supabase
      .from('subjects')
      .update({ is_current: false })
      .eq('is_current', true);

    if (updateError2) {
      throw new Error(`Failed to reset remaining subjects: ${updateError2.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Reset ${count} active subject(s) to unselected state`,
      resetCount: count,
      resetAt,
      resetUTC,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Daily subject reset cron error:', errorMessage);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
