'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { generateMealOrderId } from '@/lib/nicepay';
import { executeAdminMealOrderCancel, executePaidMealOrderCancel } from '@/lib/meal-payment-cancel';
import { getTodayKST } from '@/lib/utils';
import type { MealMenu, MealProduct, MealOrder } from '@/types/database';

/** PostgrestError 등이 콘솔에서 `{}`로만 보이는 경우 대비 — 문자열로 출력 */
function logPostgrestQueryError(scope: string, error: unknown): void {
  if (error == null) return;
  try {
    const keys = Object.getOwnPropertyNames(error);
    const snapshot: Record<string, unknown> = {};
    for (const k of keys) snapshot[k] = (error as Record<string, unknown>)[k];
    console.error(scope, JSON.stringify(snapshot, null, 2));
  } catch {
    console.error(scope, String(error));
  }
}

type AdminBranchContext = { userId: string; branchId: string };

async function requireAdminBranch(supabase: Awaited<ReturnType<typeof createClient>>): Promise<AdminBranchContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, branch_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.user_type !== 'admin' || !profile.branch_id) {
    return null;
  }

  return { userId: user.id, branchId: profile.branch_id };
}

async function assertMealProductInBranch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  branchId: string
): Promise<MealProduct | null> {
  const { data, error } = await supabase
    .from('meal_products')
    .select('*')
    .eq('id', productId)
    .eq('branch_id', branchId)
    .maybeSingle();

  if (error) {
    console.error('[assertMealProductInBranch]', error);
    return null;
  }

  return data as MealProduct | null;
}

export type MealProductAdminInput = {
  name: string;
  meal_type: 'lunch' | 'dinner';
  price: number;
  sale_start_date: string;
  sale_end_date: string;
  meal_start_date: string;
  meal_end_date: string;
  max_capacity: number | null;
  description: string | null;
  status?: 'active' | 'inactive' | 'sold_out';
};

export async function getMealProductsForAdmin(): Promise<MealProduct[]> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return [];

  const { data, error } = await supabase
    .from('meal_products')
    .select('*')
    .eq('branch_id', ctx.branchId)
    .order('created_at', { ascending: false });

  if (error) {
    logPostgrestQueryError('[getMealProductsForAdmin]', error);
    return [];
  }

  return (data ?? []) as MealProduct[];
}

export async function createMealProduct(
  data: MealProductAdminInput
): Promise<{ data?: MealProduct; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const status = data.status ?? 'active';

  const { data: inserted, error } = await supabase
    .from('meal_products')
    .insert({
      branch_id: ctx.branchId,
      name: data.name.trim(),
      meal_type: data.meal_type,
      price: data.price,
      sale_start_date: data.sale_start_date,
      sale_end_date: data.sale_end_date,
      meal_start_date: data.meal_start_date,
      meal_end_date: data.meal_end_date,
      max_capacity: data.max_capacity,
      description: data.description?.trim() || null,
      status,
    })
    .select()
    .single();

  if (error || !inserted) {
    console.error('[createMealProduct]', error);
    return { error: '상품 등록에 실패했습니다.' };
  }

  revalidatePath('/admin/meals');
  return { data: inserted as MealProduct };
}

export async function updateMealProduct(
  productId: string,
  data: Partial<MealProductAdminInput>
): Promise<{ data?: MealProduct; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const existing = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!existing) return { error: '상품을 찾을 수 없습니다.' };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.meal_type !== undefined) patch.meal_type = data.meal_type;
  if (data.price !== undefined) patch.price = data.price;
  if (data.sale_start_date !== undefined) patch.sale_start_date = data.sale_start_date;
  if (data.sale_end_date !== undefined) patch.sale_end_date = data.sale_end_date;
  if (data.meal_start_date !== undefined) patch.meal_start_date = data.meal_start_date;
  if (data.meal_end_date !== undefined) patch.meal_end_date = data.meal_end_date;
  if (data.max_capacity !== undefined) patch.max_capacity = data.max_capacity;
  if (data.description !== undefined) patch.description = data.description?.trim() || null;
  if (data.status !== undefined) patch.status = data.status;

  const { data: updated, error } = await supabase
    .from('meal_products')
    .update(patch)
    .eq('id', productId)
    .eq('branch_id', ctx.branchId)
    .select()
    .single();

  if (error || !updated) {
    console.error('[updateMealProduct]', error);
    return { error: '상품 수정에 실패했습니다.' };
  }

  revalidatePath('/admin/meals');
  revalidatePath(`/admin/meals/${productId}`);
  revalidatePath(`/admin/meals/${productId}/menus`);
  revalidatePath(`/admin/meals/${productId}/orders`);

  return { data: updated as MealProduct };
}

export async function upsertMealMenu(
  productId: string,
  dateYmd: string,
  menuText: string
): Promise<{ success?: true; menu?: MealMenu; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const product = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!product) return { error: '상품을 찾을 수 없습니다.' };

  const text = menuText.trim();
  if (!text) return { error: '메뉴 내용을 입력해 주세요.' };

  // date within meal period (KST date string compare works for YYYY-MM-DD)
  if (dateYmd < product.meal_start_date || dateYmd > product.meal_end_date) {
    return { error: '식사 기간 내 날짜만 입력할 수 있습니다.' };
  }

  const { data: saved, error } = await supabase
    .from('meal_menus')
    .upsert(
      {
        product_id: productId,
        date: dateYmd,
        menu_text: text,
      },
      { onConflict: 'product_id,date' }
    )
    .select()
    .single();

  if (error || !saved) {
    console.error('[upsertMealMenu]', error);
    return { error: '메뉴 저장에 실패했습니다.' };
  }

  revalidatePath(`/admin/meals/${productId}/menus`);
  revalidatePath(`/student/meals/${productId}`);
  revalidatePath(`/parent/meals/${productId}`);

  return { success: true, menu: saved as MealMenu };
}

export async function deleteMealMenu(menuId: string): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const { data: row, error: fetchErr } = await supabase
    .from('meal_menus')
    .select('id, product_id, meal_products!inner(branch_id)')
    .eq('id', menuId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { error: '메뉴를 찾을 수 없습니다.' };
  }

  const mp = row as unknown as {
    id: string;
    product_id: string;
    meal_products: { branch_id: string } | { branch_id: string }[];
  };
  const branchId = Array.isArray(mp.meal_products)
    ? mp.meal_products[0]?.branch_id
    : mp.meal_products?.branch_id;
  if (branchId !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }

  const { error } = await supabase.from('meal_menus').delete().eq('id', menuId);

  if (error) {
    console.error('[deleteMealMenu]', error);
    return { error: '메뉴 삭제에 실패했습니다.' };
  }

  revalidatePath(`/admin/meals/${mp.product_id}/menus`);
  revalidatePath(`/student/meals/${mp.product_id}`);
  revalidatePath(`/parent/meals/${mp.product_id}`);

  return { success: true };
}

export type MealOrderAdminFilter = {
  status?: 'all' | 'pending' | 'paid' | 'cancelled' | 'refunded' | 'failed';
};

export type MealOrderForAdmin = MealOrder & {
  student_name: string | null;
  payer_name: string | null;
};

export async function getMealOrdersForAdmin(
  productId: string,
  filters?: MealOrderAdminFilter
): Promise<MealOrderForAdmin[]> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return [];

  const product = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!product) return [];

  let q = supabase
    .from('meal_orders')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  const st = filters?.status ?? 'all';
  if (st !== 'all') {
    q = q.eq('status', st);
  }

  const { data: orders, error } = await q;

  if (error) {
    logPostgrestQueryError('[getMealOrdersForAdmin]', error);
    return [];
  }

  if (!orders?.length) {
    return [];
  }

  const ids = new Set<string>();
  for (const o of orders as MealOrder[]) {
    ids.add(o.student_id);
    ids.add(o.user_id);
  }

  const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', [...ids]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  return (orders as MealOrder[]).map((o) => ({
    ...o,
    student_name: nameById.get(o.student_id) ?? null,
    payer_name: nameById.get(o.user_id) ?? null,
  }));
}

export async function adminCancelMealOrder(
  mealOrderId: string,
  reason: string
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const admin = createAdminClient();

  const { data: orderRow, error: oErr } = await admin
    .from('meal_orders')
    .select(
      `
      id,
      product_id,
      meal_products!inner(branch_id)
    `
    )
    .eq('id', mealOrderId)
    .maybeSingle();

  if (oErr || !orderRow) {
    return { error: '주문을 찾을 수 없습니다.' };
  }

  const row = orderRow as {
    id: string;
    product_id: string;
    meal_products: { branch_id: string } | { branch_id: string }[];
  };
  const mp = Array.isArray(row.meal_products) ? row.meal_products[0] : row.meal_products;
  if (!mp || mp.branch_id !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }

  const result = await executeAdminMealOrderCancel(admin, { mealOrderId, reason });

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath(`/admin/meals/${row.product_id}/orders`);
  revalidatePath('/admin/meals');
  revalidatePath('/student/meals/orders');
  revalidatePath('/parent/meals/orders');

  return { success: true };
}

export async function getMealProducts(): Promise<MealProduct[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr) {
    logPostgrestQueryError('[getMealProducts] profiles', profileErr);
    return [];
  }

  if (!profile?.branch_id) return [];

  const today = getTodayKST();

  const { data, error } = await supabase
    .from('meal_products')
    .select('*')
    .eq('branch_id', profile.branch_id)
    .eq('status', 'active')
    .lte('sale_start_date', today)
    .gte('sale_end_date', today)
    .order('meal_type', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    logPostgrestQueryError('[getMealProducts] meal_products', error);
    return [];
  }

  return (data ?? []) as MealProduct[];
}

export async function getMealProductDetail(productId: string): Promise<MealProduct | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('id', user.id)
    .single();

  if (!profile?.branch_id) return null;

  const { data, error } = await supabase
    .from('meal_products')
    .select('*')
    .eq('id', productId)
    .eq('branch_id', profile.branch_id)
    .maybeSingle();

  if (error) {
    logPostgrestQueryError('[getMealProductDetail]', error);
    return null;
  }

  return data as MealProduct | null;
}

export async function getPaidOrderCountForProduct(productId: string): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('meal_orders')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('status', 'paid');

  if (error) {
    console.error('[getPaidOrderCountForProduct]', error);
    return 0;
  }

  return count ?? 0;
}

export async function getMealMenus(productId: string): Promise<MealMenu[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('meal_menus')
    .select('*')
    .eq('product_id', productId)
    .order('date', { ascending: true });

  if (error) {
    logPostgrestQueryError('[getMealMenus]', error);
    return [];
  }

  return (data ?? []) as MealMenu[];
}

export type MealOrderWithProduct = MealOrder & {
  meal_products: Pick<MealProduct, 'name' | 'meal_type' | 'price' | 'meal_start_date' | 'meal_end_date'> | null;
};

export async function getMealOrders(): Promise<MealOrderWithProduct[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  const selectFields = `
      *,
      meal_products (name, meal_type, price, meal_start_date, meal_end_date)
    `;

  let data: unknown[] | null = null;
  let error: Error | null = null;

  if (profile?.user_type === 'parent') {
    const { data: links } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', user.id);

    const childIds = (links ?? []).map((l) => l.student_id);
    if (childIds.length === 0) return [];

    const res = await supabase
      .from('meal_orders')
      .select(selectFields)
      .or(`user_id.eq.${user.id},student_id.in.(${childIds.join(',')})`)
      .order('created_at', { ascending: false });
    data = res.data as unknown[] | null;
    error = res.error as Error | null;
  } else {
    const res = await supabase
      .from('meal_orders')
      .select(selectFields)
      .or(`user_id.eq.${user.id},student_id.eq.${user.id}`)
      .order('created_at', { ascending: false });
    data = res.data as unknown[] | null;
    error = res.error as Error | null;
  }

  if (error) {
    logPostgrestQueryError('[getMealOrders]', error);
    return [];
  }

  return (data ?? []) as MealOrderWithProduct[];
}

export async function getMealOrderById(id: string): Promise<MealOrderWithProduct | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  const { data: row, error } = await supabase
    .from('meal_orders')
    .select(
      `
      *,
      meal_products (name, meal_type, price, meal_start_date, meal_end_date, status, sale_start_date, sale_end_date)
    `
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !row) {
    return null;
  }

  const order = row as MealOrderWithProduct;

  const allowed =
    order.user_id === user.id ||
    order.student_id === user.id ||
    (profile?.user_type === 'parent' &&
      (await supabase
        .from('parent_student_links')
        .select('id')
        .eq('parent_id', user.id)
        .eq('student_id', order.student_id)
        .maybeSingle()).data != null);

  if (!allowed) return null;

  return order;
}

export async function getExistingPendingOrder(
  productId: string,
  studentId: string
): Promise<MealOrder | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('meal_orders')
    .select('*')
    .eq('product_id', productId)
    .eq('student_id', studentId)
    .eq('status', 'pending')
    .maybeSingle();

  return (data as MealOrder | null) ?? null;
}

export async function createMealOrder(
  productId: string,
  studentId: string
): Promise<{ data?: MealOrder; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('branch_id, user_type')
    .eq('id', user.id)
    .single();

  if (!profile?.branch_id) {
    return { error: '지점 정보가 없습니다.' };
  }

  if (profile.user_type === 'student' && studentId !== user.id) {
    return { error: '본인만 신청할 수 있습니다.' };
  }

  if (profile.user_type === 'parent') {
    const { data: link } = await supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_id', user.id)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!link) {
      return { error: '연결된 자녀만 선택할 수 있습니다.' };
    }
  }

  if (profile.user_type !== 'student' && profile.user_type !== 'parent') {
    return { error: '학생 또는 학부모만 신청할 수 있습니다.' };
  }

  const { data: product, error: productErr } = await supabase
    .from('meal_products')
    .select('*')
    .eq('id', productId)
    .eq('branch_id', profile.branch_id)
    .eq('status', 'active')
    .maybeSingle();

  if (productErr || !product) {
    return { error: '상품을 찾을 수 없습니다.' };
  }

  const p = product as MealProduct;
  const today = getTodayKST();
  if (p.sale_start_date > today || p.sale_end_date < today) {
    return { error: '신청 기간이 아닙니다.' };
  }

  const { data: existing } = await supabase
    .from('meal_orders')
    .select('id, status')
    .eq('product_id', productId)
    .eq('student_id', studentId)
    .in('status', ['pending', 'paid'])
    .maybeSingle();

  if (existing) {
    return { error: '이미 신청 중이거나 결제 완료된 주문이 있습니다.' };
  }

  const admin = createAdminClient();
  const { count: paidCount } = await admin
    .from('meal_orders')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('status', 'paid');

  if (p.max_capacity != null && paidCount != null && paidCount >= p.max_capacity) {
    return { error: '정원이 마감되었습니다.' };
  }

  const orderId = generateMealOrderId();
  const { data: inserted, error: insertErr } = await supabase
    .from('meal_orders')
    .insert({
      user_id: user.id,
      student_id: studentId,
      product_id: productId,
      order_id: orderId,
      amount: p.price,
      status: 'pending',
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    console.error('[createMealOrder]', insertErr);
    return { error: '주문 생성에 실패했습니다.' };
  }

  revalidatePath('/student/meals');
  revalidatePath('/parent/meals');
  revalidatePath('/student/meals/orders');
  revalidatePath('/parent/meals/orders');

  return { data: inserted as MealOrder };
}

export async function cancelMealOrder(mealOrderId: string): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: '로그인이 필요합니다.' };

  const admin = createAdminClient();
  const result = await executePaidMealOrderCancel(admin, { userId: user.id, mealOrderId });

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath('/student/meals/orders');
  revalidatePath('/parent/meals/orders');
  revalidatePath('/student/meals');
  revalidatePath('/parent/meals');

  return { success: true };
}

/** 결제 전 대기 주문 삭제(취소) — DB만 */
export async function cancelPendingMealOrder(mealOrderId: string): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('meal_orders')
    .delete()
    .eq('id', mealOrderId)
    .eq('user_id', user.id)
    .eq('status', 'pending');

  if (error) {
    console.error('[cancelPendingMealOrder]', error);
    return { error: '취소에 실패했습니다.' };
  }

  revalidatePath('/student/meals');
  revalidatePath('/parent/meals');

  return { success: true };
}
