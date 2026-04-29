'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { generateExamOrderId, generateMealOrderId } from '@/lib/nicepay';
import { executeAdminMealOrderCancel, executePaidMealOrderCancel } from '@/lib/meal-payment-cancel';
import { getUserScope } from '@/lib/auth/scope';
import { getTodayKST } from '@/lib/utils';
import type { MealMenu, MealOrder, MealProduct, MealProductVariant } from '@/types/database';

const MEAL_IMAGES_BUCKET = 'meal-images';

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

async function requireAdminBranch(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<AdminBranchContext | null> {
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
  branchId: string,
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

export type ProductCategory = 'meal' | 'exam';

function adminBasePath(category: ProductCategory): string {
  return category === 'exam' ? '/admin/mock-exams' : '/admin/meals';
}

function studentBasePath(_category: ProductCategory): string {
  return '/student/order';
}

function parentBasePath(_category: ProductCategory): string {
  return '/parent/order';
}

// ---------------------------------------------------------------------------
// Variant 검증
// ---------------------------------------------------------------------------

export type VariantKind = 'one_time' | 'recurring';

export type VariantInput = {
  kind: VariantKind;
  price: number;
  sale_start_date: string;
  sale_end_date: string;
  product_start_date: string;
  product_end_date: string;
  max_capacity: number | null;
  status?: 'active' | 'inactive' | 'sold_out';
};

/** ISO 요일: 1=월요일 ... 7=일요일 */
function isoDayOfWeek(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  // d 는 KST 정오 기준이므로 UTC 요일과 KST 요일은 동일.
  return dow;
}

function validateVariantInput(input: VariantInput): string | null {
  if (input.price < 0) return '가격은 0 이상이어야 합니다.';
  if (input.sale_start_date > input.sale_end_date) {
    return '판매 시작일이 종료일보다 늦을 수 없습니다.';
  }
  if (input.product_start_date > input.product_end_date) {
    return '식사/시험 시작일이 종료일보다 늦을 수 없습니다.';
  }
  if (input.max_capacity != null && input.max_capacity <= 0) {
    return '최대 인원은 1 이상이어야 합니다.';
  }
  if (input.kind === 'recurring') {
    if (isoDayOfWeek(input.product_start_date) !== 1) {
      return '정기 상품은 월요일에 시작해야 합니다.';
    }
    if (isoDayOfWeek(input.product_end_date) !== 5) {
      return '정기 상품은 금요일에 종료해야 합니다.';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Admin: 상품(meta) + variant CRUD
// ---------------------------------------------------------------------------

export type MealProductCreateInput = {
  name: string;
  meal_type?: 'lunch' | 'dinner' | null;
  description: string | null;
  status?: 'active' | 'inactive' | 'sold_out';
  variant: VariantInput;
};

export interface MealProductsListParams {
  category: ProductCategory;
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'active' | 'inactive' | 'sold_out';
  sort?: 'created_at' | 'name';
  dir?: 'asc' | 'desc';
}

export interface MealProductsListResult {
  rows: Array<MealProduct & { variants: MealProductVariant[] }>;
  total: number;
  page: number;
  pageSize: number;
}

export async function getMealProductsForAdmin(
  paramsOrCategory: ProductCategory | MealProductsListParams = 'meal',
): Promise<MealProductsListResult> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { rows: [], total: 0, page: 1, pageSize: 20 };

  // 하위 호환: 단순 string 호출도 지원 (기존 호출처 유지용)
  const params: MealProductsListParams =
    typeof paramsOrCategory === 'string' ? { category: paramsOrCategory } : paramsOrCategory;

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20));
  const sort = params.sort ?? 'created_at';
  const dir = params.dir ?? 'desc';
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('meal_products')
    .select('*, meal_product_variants(*)', { count: 'exact' })
    .eq('branch_id', ctx.branchId)
    .eq('category', params.category)
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to);

  if (params.status) query = query.eq('status', params.status);
  if (params.q && params.q.trim()) {
    const pattern = `%${params.q.trim().replace(/[\\%_]/g, '\\$&')}%`;
    query = query.ilike('name', pattern);
  }

  const { data, count, error } = await query;
  if (error) {
    logPostgrestQueryError('[getMealProductsForAdmin]', error);
    return { rows: [], total: 0, page: 1, pageSize };
  }

  const rows = (data ?? []).map((row) => {
    const r = row as MealProduct & { meal_product_variants: MealProductVariant[] | null };
    return { ...r, variants: r.meal_product_variants ?? [] };
  });

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = total === 0 ? 1 : Math.min(page, lastPage);
  return { rows, total, page: clampedPage, pageSize };
}

/**
 * 상품(메타) + 첫 variant 1개 동시 생성. RPC 로 단일 트랜잭션 보장.
 * 모의고사(category='exam')는 variant.kind='one_time' 자동.
 */
export async function createMealProduct(
  input: MealProductCreateInput,
  category: ProductCategory = 'meal',
): Promise<{ data?: { product_id: string; variant_id: string }; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  if (category === 'meal' && input.meal_type !== 'lunch' && input.meal_type !== 'dinner') {
    return { error: '식사 시간(중식/석식)을 선택해 주세요.' };
  }

  const variantInput: VariantInput =
    category === 'exam' ? { ...input.variant, kind: 'one_time' } : input.variant;

  const validationErr = validateVariantInput(variantInput);
  if (validationErr) return { error: validationErr };

  const { data, error } = await supabase.rpc('create_meal_product_with_variant', {
    p_branch_id: ctx.branchId,
    p_name: input.name.trim(),
    p_category: category,
    p_meal_type: category === 'exam' ? null : (input.meal_type ?? null),
    p_description: input.description?.trim() || null,
    p_image_url: null,
    p_product_status: input.status ?? 'active',
    p_variant_kind: variantInput.kind,
    p_variant_price: variantInput.price,
    p_variant_sale_start: variantInput.sale_start_date,
    p_variant_sale_end: variantInput.sale_end_date,
    p_variant_product_start: variantInput.product_start_date,
    p_variant_product_end: variantInput.product_end_date,
    p_variant_max_capacity: variantInput.max_capacity,
    p_variant_status: variantInput.status ?? 'active',
  });

  if (error || !data || !data.length) {
    logPostgrestQueryError('[createMealProduct]', error);
    return { error: '상품 등록에 실패했습니다.' };
  }

  const row = data[0] as { product_id: string; variant_id: string };
  revalidatePath(adminBasePath(category));
  return { data: row };
}

export type MealProductUpdateInput = {
  name?: string;
  meal_type?: 'lunch' | 'dinner' | null;
  description?: string | null;
  status?: 'active' | 'inactive' | 'sold_out';
};

export async function updateMealProduct(
  productId: string,
  input: MealProductUpdateInput,
): Promise<{ data?: MealProduct; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const existing = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!existing) return { error: '상품을 찾을 수 없습니다.' };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.meal_type !== undefined && existing.category === 'meal')
    patch.meal_type = input.meal_type;
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;

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

  const updatedProduct = updated as MealProduct;
  const base = adminBasePath(updatedProduct.category);
  revalidatePath(base);
  revalidatePath(`${base}/${productId}`);
  if (updatedProduct.category === 'meal') {
    revalidatePath(`${base}/${productId}/menus`);
  }
  revalidatePath(`${base}/${productId}/orders`);
  revalidatePath(studentBasePath(updatedProduct.category));
  revalidatePath(parentBasePath(updatedProduct.category));

  return { data: updatedProduct };
}

export async function getMealProductVariants(productId: string): Promise<MealProductVariant[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('meal_product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });

  if (error) {
    logPostgrestQueryError('[getMealProductVariants]', error);
    return [];
  }
  return (data ?? []) as MealProductVariant[];
}

export async function createMealProductVariant(
  productId: string,
  input: VariantInput,
): Promise<{ data?: MealProductVariant; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const product = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!product) return { error: '상품을 찾을 수 없습니다.' };

  const variantInput: VariantInput =
    product.category === 'exam' ? { ...input, kind: 'one_time' } : input;

  const validationErr = validateVariantInput(variantInput);
  if (validationErr) return { error: validationErr };

  if (product.category === 'exam') {
    const { count } = await supabase
      .from('meal_product_variants')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId);
    if ((count ?? 0) >= 1) {
      return { error: '모의고사는 한 개의 옵션만 등록할 수 있습니다.' };
    }
  }

  const { data, error } = await supabase
    .from('meal_product_variants')
    .insert({
      product_id: productId,
      kind: variantInput.kind,
      price: variantInput.price,
      sale_start_date: variantInput.sale_start_date,
      sale_end_date: variantInput.sale_end_date,
      product_start_date: variantInput.product_start_date,
      product_end_date: variantInput.product_end_date,
      max_capacity: variantInput.max_capacity,
      status: variantInput.status ?? 'active',
    })
    .select()
    .single();

  if (error || !data) {
    logPostgrestQueryError('[createMealProductVariant]', error);
    return { error: '옵션 등록에 실패했습니다.' };
  }

  const base = adminBasePath(product.category);
  revalidatePath(base);
  revalidatePath(`${base}/${productId}`);
  revalidatePath(studentBasePath(product.category));
  revalidatePath(parentBasePath(product.category));

  return { data: data as MealProductVariant };
}

export async function updateMealProductVariant(
  variantId: string,
  input: Partial<VariantInput>,
): Promise<{ data?: MealProductVariant; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const { data: row, error: fetchErr } = await supabase
    .from('meal_product_variants')
    .select('*, meal_products!inner(branch_id, category)')
    .eq('id', variantId)
    .maybeSingle();

  if (fetchErr || !row) return { error: '옵션을 찾을 수 없습니다.' };

  const variant = row as MealProductVariant & {
    meal_products:
      | { branch_id: string; category: ProductCategory }
      | { branch_id: string; category: ProductCategory }[];
  };
  const meta = Array.isArray(variant.meal_products)
    ? variant.meal_products[0]
    : variant.meal_products;
  if (!meta || meta.branch_id !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }

  const merged: VariantInput = {
    kind: input.kind ?? variant.kind,
    price: input.price ?? variant.price,
    sale_start_date: input.sale_start_date ?? variant.sale_start_date,
    sale_end_date: input.sale_end_date ?? variant.sale_end_date,
    product_start_date: input.product_start_date ?? variant.product_start_date,
    product_end_date: input.product_end_date ?? variant.product_end_date,
    max_capacity: input.max_capacity !== undefined ? input.max_capacity : variant.max_capacity,
    status: input.status ?? variant.status,
  };
  if (meta.category === 'exam') merged.kind = 'one_time';

  const validationErr = validateVariantInput(merged);
  if (validationErr) return { error: validationErr };

  const { count: paidCount } = await supabase
    .from('meal_orders')
    .select('*', { count: 'exact', head: true })
    .eq('variant_id', variantId)
    .eq('status', 'paid');

  const hasPaid = (paidCount ?? 0) > 0;
  // 실제로 값이 바뀐 critical 필드만 가드 발동.
  // sale_start_date / sale_end_date 는 결제 후에도 수정 가능 (정책).
  const criticalChanged =
    merged.kind !== variant.kind ||
    merged.price !== variant.price ||
    merged.product_start_date !== variant.product_start_date ||
    merged.product_end_date !== variant.product_end_date ||
    merged.max_capacity !== variant.max_capacity;
  if (hasPaid && criticalChanged) {
    return {
      error:
        '결제 완료된 주문이 있어 가격·시험 기간·정원·종류는 수정할 수 없습니다. (신청 기간은 수정 가능)',
    };
  }

  const patch: Record<string, unknown> = {
    kind: merged.kind,
    price: merged.price,
    sale_start_date: merged.sale_start_date,
    sale_end_date: merged.sale_end_date,
    product_start_date: merged.product_start_date,
    product_end_date: merged.product_end_date,
    max_capacity: merged.max_capacity,
    status: merged.status,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error } = await supabase
    .from('meal_product_variants')
    .update(patch)
    .eq('id', variantId)
    .select()
    .single();

  if (error || !updated) {
    logPostgrestQueryError('[updateMealProductVariant]', error);
    return { error: '옵션 수정에 실패했습니다.' };
  }

  const base = adminBasePath(meta.category);
  revalidatePath(base);
  revalidatePath(`${base}/${variant.product_id}`);
  revalidatePath(studentBasePath(meta.category));
  revalidatePath(parentBasePath(meta.category));

  return { data: updated as MealProductVariant };
}

// ---------------------------------------------------------------------------
// product 메타 + variant 동시 update (단일 트랜잭션 RPC)
// 어드민 detail 폼에서 두 번의 호출이 부분 저장을 일으키던 문제 해결.
// ---------------------------------------------------------------------------

export type ProductAndVariantUpdateInput = {
  product: {
    name: string;
    description: string | null;
    status: 'active' | 'inactive' | 'sold_out';
    meal_type?: 'lunch' | 'dinner' | null;
  };
  variant: VariantInput;
};

export async function updateMealProductAndVariant(
  productId: string,
  variantId: string,
  input: ProductAndVariantUpdateInput,
): Promise<{ data?: { productId: string; variantId: string }; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  // RPC 가 admin 권한 / branch 일치 / paid 가드 / category 보정을 모두 처리.
  const { data, error } = await supabase.rpc('update_meal_product_with_variant', {
    p_product_id: productId,
    p_variant_id: variantId,
    p_name: input.product.name.trim(),
    p_description: input.product.description?.trim() || null,
    p_status: input.product.status,
    p_meal_type: input.product.meal_type ?? null,
    p_variant_kind: input.variant.kind,
    p_variant_price: input.variant.price,
    p_variant_sale_start: input.variant.sale_start_date,
    p_variant_sale_end: input.variant.sale_end_date,
    p_variant_product_start: input.variant.product_start_date,
    p_variant_product_end: input.variant.product_end_date,
    p_variant_max_capacity: input.variant.max_capacity,
    p_variant_status: input.variant.status ?? 'active',
  });

  if (error) {
    logPostgrestQueryError('[updateMealProductAndVariant]', error);
    const raw = (error.message ?? '').replace(/^ERROR:\s*/i, '').trim();
    return { error: raw || '저장에 실패했습니다.' };
  }
  if (!data || !data.length) {
    return { error: '저장에 실패했습니다.' };
  }

  // 카테고리는 productId 로 다시 조회하지 않고, 호출 시 제공된 paths 를 모두 무효화.
  // (가벼운 비용으로 admin/student/parent 모두 새 데이터 노출)
  const { data: cat } = await supabase
    .from('meal_products')
    .select('category')
    .eq('id', productId)
    .maybeSingle();
  const category = (cat?.category ?? 'meal') as ProductCategory;

  const adminBase = adminBasePath(category);
  revalidatePath(adminBase);
  revalidatePath(`${adminBase}/${productId}`);
  revalidatePath(`${adminBase}/${productId}/orders`);
  if (category === 'meal') {
    revalidatePath(`${adminBase}/${productId}/menus`);
  }
  revalidatePath(studentBasePath(category));
  revalidatePath(parentBasePath(category));

  const row = data[0] as { out_product_id: string; out_variant_id: string };
  return { data: { productId: row.out_product_id, variantId: row.out_variant_id } };
}

export async function deleteMealProductVariant(
  variantId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const { data: row, error: fetchErr } = await supabase
    .from('meal_product_variants')
    .select('id, product_id, meal_products!inner(branch_id, category)')
    .eq('id', variantId)
    .maybeSingle();

  if (fetchErr || !row) return { error: '옵션을 찾을 수 없습니다.' };

  const variant = row as {
    id: string;
    product_id: string;
    meal_products:
      | { branch_id: string; category: ProductCategory }
      | { branch_id: string; category: ProductCategory }[];
  };
  const meta = Array.isArray(variant.meal_products)
    ? variant.meal_products[0]
    : variant.meal_products;
  if (!meta || meta.branch_id !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }

  const { count: orderCount } = await supabase
    .from('meal_orders')
    .select('*', { count: 'exact', head: true })
    .eq('variant_id', variantId)
    .in('status', ['pending', 'paid']);

  if ((orderCount ?? 0) > 0) {
    return { error: '진행 중이거나 결제 완료된 주문이 있어 삭제할 수 없습니다.' };
  }

  const { error } = await supabase.from('meal_product_variants').delete().eq('id', variantId);
  if (error) {
    logPostgrestQueryError('[deleteMealProductVariant]', error);
    return { error: '옵션 삭제에 실패했습니다.' };
  }

  const base = adminBasePath(meta.category);
  revalidatePath(base);
  revalidatePath(`${base}/${variant.product_id}`);
  revalidatePath(studentBasePath(meta.category));
  revalidatePath(parentBasePath(meta.category));

  return { success: true };
}

// ---------------------------------------------------------------------------
// Admin: 메뉴 (product FK 유지)
// ---------------------------------------------------------------------------

async function getProductMenuDateRange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
): Promise<{ minStart: string; maxEnd: string } | null> {
  const { data } = await supabase
    .from('meal_product_variants')
    .select('product_start_date, product_end_date')
    .eq('product_id', productId);
  if (!data?.length) return null;
  let min = data[0].product_start_date as string;
  let max = data[0].product_end_date as string;
  for (const r of data) {
    if ((r.product_start_date as string) < min) min = r.product_start_date as string;
    if ((r.product_end_date as string) > max) max = r.product_end_date as string;
  }
  return { minStart: min, maxEnd: max };
}

export async function upsertMealMenu(
  productId: string,
  dateYmd: string,
  menuText: string,
): Promise<{ success?: true; menu?: MealMenu; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const product = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!product) return { error: '상품을 찾을 수 없습니다.' };

  const text = menuText.trim();
  if (!text) return { error: '메뉴 내용을 입력해 주세요.' };

  const range = await getProductMenuDateRange(supabase, productId);
  if (!range) {
    return { error: '먼저 옵션(판매 단위)을 등록해 주세요.' };
  }
  if (dateYmd < range.minStart || dateYmd > range.maxEnd) {
    return { error: '식사 기간 내 날짜만 입력할 수 있습니다.' };
  }

  const { data: saved, error } = await supabase
    .from('meal_menus')
    .upsert(
      { product_id: productId, date: dateYmd, menu_text: text },
      { onConflict: 'product_id,date' },
    )
    .select()
    .single();

  if (error || !saved) {
    console.error('[upsertMealMenu]', error);
    return { error: '메뉴 저장에 실패했습니다.' };
  }

  revalidatePath(`${adminBasePath('meal')}/${productId}/menus`);
  revalidatePath(`${studentBasePath('meal')}/${productId}`);
  revalidatePath(`${parentBasePath('meal')}/${productId}`);

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

  revalidatePath(`${adminBasePath('meal')}/${mp.product_id}/menus`);
  revalidatePath(`${studentBasePath('meal')}/${mp.product_id}`);
  revalidatePath(`${parentBasePath('meal')}/${mp.product_id}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Admin: 주문 관리
// ---------------------------------------------------------------------------

export type MealOrderAdminFilter = {
  status?: 'all' | 'pending' | 'paid' | 'cancelled' | 'refunded' | 'failed';
  variantId?: string;
};

export type MealOrderForAdmin = MealOrder & {
  student_name: string | null;
  payer_name: string | null;
  variant: Pick<
    MealProductVariant,
    'id' | 'kind' | 'product_start_date' | 'product_end_date'
  > | null;
};

export async function getMealOrdersForAdmin(
  productId: string,
  filters?: MealOrderAdminFilter,
): Promise<MealOrderForAdmin[]> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return [];

  const product = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!product) return [];

  let q = supabase
    .from('meal_orders')
    .select(
      `*, meal_product_variants!inner(id, kind, product_start_date, product_end_date, product_id)`,
    )
    .eq('meal_product_variants.product_id', productId)
    .order('created_at', { ascending: false });

  const st = filters?.status ?? 'all';
  if (st !== 'all') q = q.eq('status', st);
  if (filters?.variantId) q = q.eq('variant_id', filters.variantId);

  const { data: orders, error } = await q;

  if (error) {
    logPostgrestQueryError('[getMealOrdersForAdmin]', error);
    return [];
  }
  if (!orders?.length) return [];

  const rows = orders as Array<
    MealOrder & {
      meal_product_variants:
        | (Pick<MealProductVariant, 'id' | 'kind' | 'product_start_date' | 'product_end_date'> & {
            product_id: string;
          })
        | (Pick<MealProductVariant, 'id' | 'kind' | 'product_start_date' | 'product_end_date'> & {
            product_id: string;
          })[]
        | null;
    }
  >;

  const ids = new Set<string>();
  for (const o of rows) {
    ids.add(o.student_id);
    ids.add(o.user_id);
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', [...ids]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  return rows.map((o) => {
    const v = Array.isArray(o.meal_product_variants)
      ? o.meal_product_variants[0]
      : o.meal_product_variants;
    return {
      ...o,
      student_name: nameById.get(o.student_id) ?? null,
      payer_name: nameById.get(o.user_id) ?? null,
      variant: v
        ? {
            id: v.id,
            kind: v.kind,
            product_start_date: v.product_start_date,
            product_end_date: v.product_end_date,
          }
        : null,
    };
  });
}

export async function adminCancelMealOrder(
  mealOrderId: string,
  reason: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const admin = createAdminClient();

  const { data: orderRow, error: oErr } = await admin
    .from('meal_orders')
    .select(
      `id, variant_id,
       meal_product_variants!inner(
         product_id,
         meal_products!inner(branch_id, category)
       )`,
    )
    .eq('id', mealOrderId)
    .maybeSingle();

  if (oErr || !orderRow) return { error: '주문을 찾을 수 없습니다.' };

  const row = orderRow as {
    id: string;
    variant_id: string;
    meal_product_variants:
      | {
          product_id: string;
          meal_products:
            | { branch_id: string; category: ProductCategory }
            | { branch_id: string; category: ProductCategory }[];
        }
      | {
          product_id: string;
          meal_products:
            | { branch_id: string; category: ProductCategory }
            | { branch_id: string; category: ProductCategory }[];
        }[];
  };
  const v = Array.isArray(row.meal_product_variants)
    ? row.meal_product_variants[0]
    : row.meal_product_variants;
  const meta = Array.isArray(v?.meal_products) ? v?.meal_products[0] : v?.meal_products;
  if (!meta || meta.branch_id !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }

  const result = await executeAdminMealOrderCancel(admin, { mealOrderId, reason });
  if (!result.success) return { error: result.error };

  const adminBase = adminBasePath(meta.category);
  revalidatePath(`${adminBase}/${v.product_id}/orders`);
  revalidatePath(adminBase);
  revalidatePath(studentBasePath(meta.category));
  revalidatePath(parentBasePath(meta.category));

  return { success: true };
}

// ---------------------------------------------------------------------------
// 학생/학부모: 상품 조회
// ---------------------------------------------------------------------------

export type MealProductWithVariants = MealProduct & {
  variants: MealProductVariant[];
};

/**
 * 학생/학부모 리스트용 — 활성 variant 1개 이상 + 판매기간 내인 상품.
 */
export async function getMealProducts(
  category: ProductCategory = 'meal',
): Promise<MealProductWithVariants[]> {
  const scope = await getUserScope();
  if (!scope || !scope.hasAccess) return [];

  const supabase = await createClient();
  const today = getTodayKST();

  const { data, error } = await supabase
    .from('meal_products')
    .select('*, meal_product_variants(*)')
    .in('branch_id', scope.branchIds)
    .eq('category', category)
    .eq('status', 'active');

  if (error) {
    logPostgrestQueryError('[getMealProducts]', error);
    return [];
  }

  const result: MealProductWithVariants[] = [];
  for (const row of data ?? []) {
    const r = row as MealProduct & { meal_product_variants: MealProductVariant[] | null };
    const variants = (r.meal_product_variants ?? []).filter(
      (v) => v.status === 'active' && v.sale_start_date <= today && v.sale_end_date >= today,
    );
    if (variants.length === 0) continue;
    result.push({ ...r, variants });
  }

  result.sort((a, b) => {
    if (category === 'meal') {
      const am = a.meal_type ?? '';
      const bm = b.meal_type ?? '';
      if (am !== bm) return am.localeCompare(bm);
    }
    return a.name.localeCompare(b.name);
  });

  return result;
}

/**
 * 자녀(학생)별로 상품당 진행 중인 주문 상태.
 * 키는 product_id (variant 단위가 아닌 상품 단위 — 리스트 카드 표시용).
 */
export async function getMealActiveOrderStatusByStudentIds(
  studentIds: string[],
): Promise<Record<string, Record<string, 'pending' | 'paid'>>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || studentIds.length === 0) return {};

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  let allowedStudentIds: string[] = [];

  if (profile?.user_type === 'student') {
    if (studentIds.length !== 1 || studentIds[0] !== user.id) return {};
    allowedStudentIds = [user.id];
  } else if (profile?.user_type === 'parent') {
    const { data: links } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', user.id)
      .in('student_id', studentIds);
    const linkSet = new Set((links ?? []).map((l) => l.student_id));
    allowedStudentIds = studentIds.filter((id) => linkSet.has(id));
    if (allowedStudentIds.length === 0) return {};
  } else {
    return {};
  }

  const { data, error } = await supabase
    .from('meal_orders')
    .select('student_id, status, meal_product_variants!inner(product_id)')
    .in('student_id', allowedStudentIds)
    .in('status', ['pending', 'paid']);

  if (error) {
    logPostgrestQueryError('[getMealActiveOrderStatusByStudentIds]', error);
    return {};
  }

  const out: Record<string, Record<string, 'pending' | 'paid'>> = {};
  for (const id of allowedStudentIds) out[id] = {};

  for (const row of data ?? []) {
    const r = row as {
      student_id: string;
      status: 'pending' | 'paid';
      meal_product_variants: { product_id: string } | { product_id: string }[];
    };
    const v = Array.isArray(r.meal_product_variants)
      ? r.meal_product_variants[0]
      : r.meal_product_variants;
    if (!v) continue;
    const bucket = out[r.student_id];
    if (!bucket) continue;
    const prev = bucket[v.product_id];
    if (!prev || (prev === 'pending' && r.status === 'paid')) {
      bucket[v.product_id] = r.status;
    }
  }
  return out;
}

export async function getMealActiveOrderStatusForMealListStudent(): Promise<
  Record<string, 'pending' | 'paid'>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  const byStudent = await getMealActiveOrderStatusByStudentIds([user.id]);
  return byStudent[user.id] ?? {};
}

export async function getMealProductDetail(
  productId: string,
  category?: ProductCategory,
): Promise<MealProductWithVariants | null> {
  const scope = await getUserScope();
  if (!scope || !scope.hasAccess) return null;

  const supabase = await createClient();

  let query = supabase
    .from('meal_products')
    .select('*, meal_product_variants(*)')
    .eq('id', productId)
    .in('branch_id', scope.branchIds);

  if (category) query = query.eq('category', category);

  const { data, error } = await query.maybeSingle();
  if (error) {
    logPostgrestQueryError('[getMealProductDetail]', error);
    return null;
  }
  if (!data) return null;

  const r = data as MealProduct & { meal_product_variants: MealProductVariant[] | null };
  return { ...r, variants: r.meal_product_variants ?? [] };
}

export async function getPaidOrderCountForVariant(variantId: string): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('meal_orders')
    .select('*', { count: 'exact', head: true })
    .eq('variant_id', variantId)
    .eq('status', 'paid');

  if (error) {
    console.error('[getPaidOrderCountForVariant]', error);
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

// ---------------------------------------------------------------------------
// 학생/학부모: 주문
// ---------------------------------------------------------------------------

export type OrderProductInfo = Pick<MealProduct, 'id' | 'name' | 'meal_type' | 'category'>;
export type OrderVariantInfo = Pick<
  MealProductVariant,
  | 'id'
  | 'kind'
  | 'price'
  | 'product_id'
  | 'product_start_date'
  | 'product_end_date'
  | 'sale_start_date'
  | 'sale_end_date'
>;

export type MealOrderWithProduct = MealOrder & {
  variant: OrderVariantInfo | null;
  product: OrderProductInfo | null;
};

function pickVariantWithProduct(raw: unknown): {
  variant: OrderVariantInfo | null;
  product: OrderProductInfo | null;
} {
  type VariantJoin = OrderVariantInfo & {
    meal_products: OrderProductInfo | OrderProductInfo[] | null;
  };
  if (raw == null) return { variant: null, product: null };
  const v = Array.isArray(raw) ? (raw[0] ?? null) : (raw as VariantJoin);
  if (!v) return { variant: null, product: null };
  const mealProducts = (v as VariantJoin).meal_products;
  const product = Array.isArray(mealProducts) ? (mealProducts[0] ?? null) : (mealProducts ?? null);
  return {
    variant: {
      id: v.id,
      kind: v.kind,
      price: v.price,
      product_id: v.product_id,
      product_start_date: v.product_start_date,
      product_end_date: v.product_end_date,
      sale_start_date: v.sale_start_date,
      sale_end_date: v.sale_end_date,
    },
    product: product
      ? {
          id: product.id,
          name: product.name,
          meal_type: product.meal_type,
          category: product.category,
        }
      : null,
  };
}

export async function getMealOrders(
  category: ProductCategory = 'meal',
): Promise<MealOrderWithProduct[]> {
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
    meal_product_variants!inner(
      id, kind, price, product_id, product_start_date, product_end_date, sale_start_date, sale_end_date,
      meal_products!inner(id, name, meal_type, category)
    )
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
      .eq('meal_product_variants.meal_products.category', category)
      .order('created_at', { ascending: false });
    data = res.data as unknown[] | null;
    error = res.error as Error | null;
  } else {
    const res = await supabase
      .from('meal_orders')
      .select(selectFields)
      .or(`user_id.eq.${user.id},student_id.eq.${user.id}`)
      .eq('meal_product_variants.meal_products.category', category)
      .order('created_at', { ascending: false });
    data = res.data as unknown[] | null;
    error = res.error as Error | null;
  }

  if (error) {
    logPostgrestQueryError('[getMealOrders]', error);
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as MealOrder & { meal_product_variants: unknown };
    const { variant, product } = pickVariantWithProduct(r.meal_product_variants);
    return { ...r, variant, product } as MealOrderWithProduct;
  });
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
      meal_product_variants(
        id, kind, price, product_id, product_start_date, product_end_date, sale_start_date, sale_end_date, status,
        meal_products(id, name, meal_type, category, status)
      )
    `,
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !row) return null;

  const order = row as MealOrder & { meal_product_variants: unknown };
  const allowed =
    order.user_id === user.id ||
    order.student_id === user.id ||
    (profile?.user_type === 'parent' &&
      (
        await supabase
          .from('parent_student_links')
          .select('id')
          .eq('parent_id', user.id)
          .eq('student_id', order.student_id)
          .maybeSingle()
      ).data != null);

  if (!allowed) return null;

  const { variant, product } = pickVariantWithProduct(order.meal_product_variants);
  return { ...order, variant, product };
}

export async function getExistingPendingOrder(
  variantId: string,
  studentId: string,
): Promise<MealOrder | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('meal_orders')
    .select('*')
    .eq('variant_id', variantId)
    .eq('student_id', studentId)
    .eq('status', 'pending')
    .maybeSingle();

  return (data as MealOrder | null) ?? null;
}

export async function getExistingPaidOrder(
  variantId: string,
  studentId: string,
): Promise<MealOrder | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('meal_orders')
    .select('*')
    .eq('variant_id', variantId)
    .eq('student_id', studentId)
    .eq('status', 'paid')
    .maybeSingle();

  return (data as MealOrder | null) ?? null;
}

export type OrderConflictItem = {
  variant_id: string;
  product_name: string;
  variant_kind: 'one_time' | 'recurring';
  product_start_date: string;
  product_end_date: string;
  status: 'pending' | 'paid';
};

export type CreateMealOrderResult = {
  data?: MealOrder;
  error?: string;
  conflict?: OrderConflictItem[];
};

/**
 * 식사 일자 겹침 검사 — 같은 학생의 active(pending|paid) 주문 중,
 * 같은 (category, meal_type) 범위에서 식사 기간이 겹치는 항목을 반환.
 * - exam 끼리도 동일 검증 적용 (시험 일정 충돌)
 * - 동일 variant 자기 자신은 결과에서 제외 (그건 별도 차단)
 */
async function findOverlappingActiveOrders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  newVariant: {
    id: string;
    product_start_date: string;
    product_end_date: string;
    category: 'meal' | 'exam';
    meal_type: 'lunch' | 'dinner' | null;
  },
): Promise<OrderConflictItem[]> {
  const { data, error } = await supabase
    .from('meal_orders')
    .select(
      `id, status, variant_id,
       meal_product_variants!inner(
         kind, product_start_date, product_end_date,
         meal_products!inner(name, meal_type, category)
       )`,
    )
    .eq('student_id', studentId)
    .in('status', ['pending', 'paid']);

  if (error) {
    logPostgrestQueryError('[findOverlappingActiveOrders]', error);
    return [];
  }

  type Row = {
    id: string;
    status: 'pending' | 'paid';
    variant_id: string;
    meal_product_variants:
      | {
          kind: 'one_time' | 'recurring';
          product_start_date: string;
          product_end_date: string;
          meal_products:
            | { name: string; meal_type: 'lunch' | 'dinner' | null; category: 'meal' | 'exam' }
            | { name: string; meal_type: 'lunch' | 'dinner' | null; category: 'meal' | 'exam' }[];
        }
      | {
          kind: 'one_time' | 'recurring';
          product_start_date: string;
          product_end_date: string;
          meal_products:
            | { name: string; meal_type: 'lunch' | 'dinner' | null; category: 'meal' | 'exam' }
            | { name: string; meal_type: 'lunch' | 'dinner' | null; category: 'meal' | 'exam' }[];
        }[];
  };

  const out: OrderConflictItem[] = [];
  for (const row of (data ?? []) as Row[]) {
    if (row.variant_id === newVariant.id) continue;
    const v = Array.isArray(row.meal_product_variants)
      ? row.meal_product_variants[0]
      : row.meal_product_variants;
    if (!v) continue;
    const p = Array.isArray(v.meal_products) ? v.meal_products[0] : v.meal_products;
    if (!p) continue;
    if (p.category !== newVariant.category) continue;
    if (p.category === 'meal' && p.meal_type !== newVariant.meal_type) continue;
    // 기간 겹침: existing.start <= new.end AND new.start <= existing.end
    if (
      v.product_start_date <= newVariant.product_end_date &&
      newVariant.product_start_date <= v.product_end_date
    ) {
      out.push({
        variant_id: row.variant_id,
        product_name: p.name,
        variant_kind: v.kind,
        product_start_date: v.product_start_date,
        product_end_date: v.product_end_date,
        status: row.status,
      });
    }
  }
  return out;
}

export async function createMealOrder(
  variantId: string,
  studentId: string,
  options?: { force?: boolean },
): Promise<CreateMealOrderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (profile?.user_type !== 'student' && profile?.user_type !== 'parent') {
    return { error: '학생 또는 학부모만 신청할 수 있습니다.' };
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
    if (!link) return { error: '연결된 자녀만 선택할 수 있습니다.' };
  }

  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('id', studentId)
    .maybeSingle();

  if (!studentProfile?.branch_id) {
    return { error: '학생의 지점 정보가 없습니다.' };
  }

  const { data: variantRow, error: variantErr } = await supabase
    .from('meal_product_variants')
    .select('*, meal_products!inner(id, branch_id, category, meal_type, status)')
    .eq('id', variantId)
    .maybeSingle();

  if (variantErr || !variantRow) {
    return { error: '옵션을 찾을 수 없습니다.' };
  }

  type ProductJoinForOrder = {
    id: string;
    branch_id: string;
    category: ProductCategory;
    meal_type: 'lunch' | 'dinner' | null;
    status: string;
  };
  const v = variantRow as MealProductVariant & {
    meal_products: ProductJoinForOrder | ProductJoinForOrder[];
  };
  const product = Array.isArray(v.meal_products) ? v.meal_products[0] : v.meal_products;
  if (!product || product.branch_id !== studentProfile.branch_id) {
    return { error: '상품을 찾을 수 없습니다.' };
  }
  if (product.status !== 'active' || v.status !== 'active') {
    return { error: '판매 중이 아닙니다.' };
  }

  const today = getTodayKST();
  if (v.sale_start_date > today || v.sale_end_date < today) {
    return { error: '신청 기간이 아닙니다.' };
  }

  const { data: existing } = await supabase
    .from('meal_orders')
    .select('id, status')
    .eq('variant_id', variantId)
    .eq('student_id', studentId)
    .in('status', ['pending', 'paid'])
    .maybeSingle();

  if (existing) {
    return { error: '이미 신청 중이거나 결제 완료된 주문이 있습니다.' };
  }

  // 식사 일자 겹침 검증: 동일 (category, meal_type) 범위에서 다른 variant 와 기간 겹치면 conflict 반환.
  // 사용자가 모달에서 명시 동의(force=true)한 경우만 통과.
  if (!options?.force) {
    const overlaps = await findOverlappingActiveOrders(supabase, studentId, {
      id: variantId,
      product_start_date: v.product_start_date,
      product_end_date: v.product_end_date,
      category: product.category,
      meal_type: product.meal_type ?? null,
    });
    if (overlaps.length > 0) {
      return { conflict: overlaps };
    }
  }

  const admin = createAdminClient();
  if (v.max_capacity != null) {
    const { count: paidCount } = await admin
      .from('meal_orders')
      .select('*', { count: 'exact', head: true })
      .eq('variant_id', variantId)
      .eq('status', 'paid');
    if ((paidCount ?? 0) >= v.max_capacity) {
      return { error: '정원이 마감되었습니다.' };
    }
  }

  const orderId = product.category === 'exam' ? generateExamOrderId() : generateMealOrderId();
  const { data: inserted, error: insertErr } = await supabase
    .from('meal_orders')
    .insert({
      user_id: user.id,
      student_id: studentId,
      variant_id: variantId,
      order_id: orderId,
      amount: v.price,
      status: 'pending',
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    console.error('[createMealOrder]', insertErr);
    return { error: '주문 생성에 실패했습니다.' };
  }

  revalidatePath(studentBasePath(product.category));
  revalidatePath(parentBasePath(product.category));

  return { data: inserted as MealOrder };
}

/**
 * 결제 미완료(pending) 주문을 이어서 결제할 때, 그 시점의 식사일 겹침을 재검사.
 * createMealOrder 처음 호출 후 사용자가 결제 페이지에서 취소하고 돌아왔을 때,
 * 그 사이 다른 variant가 추가됐을 수도 있으니 다시 한 번 사용자 동의를 받기 위함.
 */
export async function getOrderResumeConflicts(
  orderId: string,
): Promise<{ conflicts?: OrderConflictItem[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: order, error } = await supabase
    .from('meal_orders')
    .select(
      `
      id, status, student_id, variant_id,
      meal_product_variants!inner(
        product_start_date, product_end_date,
        meal_products!inner(category, meal_type)
      )
    `,
    )
    .eq('id', orderId)
    .maybeSingle();

  if (error || !order) return { error: '주문을 찾을 수 없습니다.' };
  if (order.status !== 'pending') return { conflicts: [] };

  type VRow = {
    product_start_date: string;
    product_end_date: string;
    meal_products:
      | { category: ProductCategory; meal_type: 'lunch' | 'dinner' | null }
      | { category: ProductCategory; meal_type: 'lunch' | 'dinner' | null }[];
  };
  const raw = order as {
    student_id: string;
    variant_id: string;
    meal_product_variants: VRow | VRow[];
  };
  const v = Array.isArray(raw.meal_product_variants)
    ? raw.meal_product_variants[0]
    : raw.meal_product_variants;
  if (!v) return { conflicts: [] };
  const p = Array.isArray(v.meal_products) ? v.meal_products[0] : v.meal_products;
  if (!p) return { conflicts: [] };

  const conflicts = await findOverlappingActiveOrders(supabase, raw.student_id, {
    id: raw.variant_id,
    product_start_date: v.product_start_date,
    product_end_date: v.product_end_date,
    category: p.category,
    meal_type: p.meal_type ?? null,
  });
  return { conflicts };
}

export async function cancelMealOrder(
  mealOrderId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: '로그인이 필요합니다.' };

  const admin = createAdminClient();
  const result = await executePaidMealOrderCancel(admin, { userId: user.id, mealOrderId });

  if (!result.success) return { error: result.error };

  for (const cat of ['meal', 'exam'] as const) {
    revalidatePath(studentBasePath(cat));
    revalidatePath(parentBasePath(cat));
  }

  return { success: true };
}

export async function cancelPendingMealOrder(
  mealOrderId: string,
): Promise<{ success?: true; error?: string }> {
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

  for (const cat of ['meal', 'exam'] as const) {
    revalidatePath(studentBasePath(cat));
    revalidatePath(parentBasePath(cat));
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Image helpers (변경 없음 — product 레벨)
// ---------------------------------------------------------------------------

function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/object/public/${MEAL_IMAGES_BUCKET}/`;
  const i = publicUrl.indexOf(marker);
  if (i === -1) return null;
  const rest = publicUrl.slice(i + marker.length).split('?')[0];
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

function sanitizeFileName(name: string): string {
  const base = name
    .replace(/[/\\]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^\x20-\x7E]/g, '');
  const dotIdx = base.lastIndexOf('.');
  const ext = dotIdx >= 0 ? base.slice(dotIdx) : '';
  const stem = dotIdx >= 0 ? base.slice(0, dotIdx) : base;
  const cleanStem = stem.replace(/[^a-zA-Z0-9_-]/g, '') || 'image';
  return (cleanStem + ext).slice(0, 200);
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'JPG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다.';
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return '이미지 크기는 5MB 이하여야 합니다.';
  }
  return null;
}

export async function uploadMealProductImage(
  productId: string,
  formData: FormData,
): Promise<{ data?: { url: string }; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const product = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!product) return { error: '상품을 찾을 수 없습니다.' };

  const file = formData.get('file') as File | null;
  if (!file) return { error: '파일을 선택해 주세요.' };

  const validationErr = validateImageFile(file);
  if (validationErr) return { error: validationErr };

  if (product.image_url) {
    const oldPath = storagePathFromPublicUrl(product.image_url);
    if (oldPath) {
      await supabase.storage.from(MEAL_IMAGES_BUCKET).remove([oldPath]);
    }
  }

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${ctx.userId}/products/${productId}/${Date.now()}_${safeName}`;

  const { data: uploaded, error: upErr } = await supabase.storage
    .from(MEAL_IMAGES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (upErr || !uploaded) {
    console.error('[uploadMealProductImage] storage', upErr);
    return { error: '이미지 업로드에 실패했습니다.' };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(MEAL_IMAGES_BUCKET).getPublicUrl(uploaded.path);

  const { error: dbErr } = await supabase
    .from('meal_products')
    .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('branch_id', ctx.branchId);

  if (dbErr) {
    console.error('[uploadMealProductImage] db', dbErr);
    return { error: '이미지 정보 저장에 실패했습니다.' };
  }

  const adminBase = adminBasePath(product.category);
  revalidatePath(adminBase);
  revalidatePath(`${adminBase}/${productId}`);
  revalidatePath(studentBasePath(product.category));
  revalidatePath(parentBasePath(product.category));

  return { data: { url: publicUrl } };
}

export async function deleteMealProductImage(
  productId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const product = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!product) return { error: '상품을 찾을 수 없습니다.' };

  if (product.image_url) {
    const oldPath = storagePathFromPublicUrl(product.image_url);
    if (oldPath) {
      await supabase.storage.from(MEAL_IMAGES_BUCKET).remove([oldPath]);
    }
  }

  const { error } = await supabase
    .from('meal_products')
    .update({ image_url: null, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('branch_id', ctx.branchId);

  if (error) {
    console.error('[deleteMealProductImage]', error);
    return { error: '이미지 삭제에 실패했습니다.' };
  }

  const adminBase = adminBasePath(product.category);
  revalidatePath(adminBase);
  revalidatePath(`${adminBase}/${productId}`);
  revalidatePath(studentBasePath(product.category));
  revalidatePath(parentBasePath(product.category));

  return { success: true };
}

export async function uploadMealMenuImage(
  productId: string,
  menuId: string,
  formData: FormData,
): Promise<{ data?: { url: string }; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const product = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!product) return { error: '상품을 찾을 수 없습니다.' };

  const { data: menu } = await supabase
    .from('meal_menus')
    .select('id, image_url')
    .eq('id', menuId)
    .eq('product_id', productId)
    .maybeSingle();

  if (!menu) return { error: '메뉴를 찾을 수 없습니다.' };

  const file = formData.get('file') as File | null;
  if (!file) return { error: '파일을 선택해 주세요.' };

  const validationErr = validateImageFile(file);
  if (validationErr) return { error: validationErr };

  if (menu.image_url) {
    const oldPath = storagePathFromPublicUrl(menu.image_url);
    if (oldPath) {
      await supabase.storage.from(MEAL_IMAGES_BUCKET).remove([oldPath]);
    }
  }

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${ctx.userId}/menus/${menuId}/${Date.now()}_${safeName}`;

  const { data: uploaded, error: upErr } = await supabase.storage
    .from(MEAL_IMAGES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (upErr || !uploaded) {
    console.error('[uploadMealMenuImage] storage', upErr);
    return { error: '이미지 업로드에 실패했습니다.' };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(MEAL_IMAGES_BUCKET).getPublicUrl(uploaded.path);

  const { error: dbErr } = await supabase
    .from('meal_menus')
    .update({ image_url: publicUrl })
    .eq('id', menuId);

  if (dbErr) {
    console.error('[uploadMealMenuImage] db', dbErr);
    return { error: '이미지 정보 저장에 실패했습니다.' };
  }

  revalidatePath(`${adminBasePath('meal')}/${productId}/menus`);
  revalidatePath(`${studentBasePath('meal')}/${productId}`);
  revalidatePath(`${parentBasePath('meal')}/${productId}`);

  return { data: { url: publicUrl } };
}

export async function deleteMealMenuImage(
  productId: string,
  menuId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const product = await assertMealProductInBranch(supabase, productId, ctx.branchId);
  if (!product) return { error: '상품을 찾을 수 없습니다.' };

  const { data: menu } = await supabase
    .from('meal_menus')
    .select('id, image_url')
    .eq('id', menuId)
    .eq('product_id', productId)
    .maybeSingle();

  if (!menu) return { error: '메뉴를 찾을 수 없습니다.' };

  if (menu.image_url) {
    const oldPath = storagePathFromPublicUrl(menu.image_url);
    if (oldPath) {
      await supabase.storage.from(MEAL_IMAGES_BUCKET).remove([oldPath]);
    }
  }

  const { error } = await supabase.from('meal_menus').update({ image_url: null }).eq('id', menuId);

  if (error) {
    console.error('[deleteMealMenuImage]', error);
    return { error: '이미지 삭제에 실패했습니다.' };
  }

  revalidatePath(`${adminBasePath('meal')}/${productId}/menus`);
  revalidatePath(`${studentBasePath('meal')}/${productId}`);
  revalidatePath(`${parentBasePath('meal')}/${productId}`);

  return { success: true };
}
