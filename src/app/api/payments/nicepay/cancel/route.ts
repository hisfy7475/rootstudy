import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { executePaidMealOrderCancel } from '@/lib/meal-payment-cancel';

type Body = {
  mealOrderId?: string;
};

/**
 * 로그인 사용자 본인 급식 주문 취소 (학생/학부모)
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const mealOrderId = body.mealOrderId?.trim();
  if (!mealOrderId) {
    return NextResponse.json({ error: 'mealOrderId is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await executePaidMealOrderCancel(admin, { userId: user.id, mealOrderId });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 }
    );
  }

  return NextResponse.json({ success: true });
}
