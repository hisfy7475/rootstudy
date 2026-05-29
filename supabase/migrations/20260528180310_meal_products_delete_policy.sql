-- meal_products 에 admin DELETE RLS 정책 추가.
-- 어드민의 급식/모의고사 상품 영구 삭제 기능을 위해 필요.
-- (오등록된 상품 정리 — 신청 이력이 있으면 meal_orders.variant_id RESTRICT 로 DB 단에서 차단.)
-- 슈퍼관리자 호환을 위해 OR public.is_super_admin() 명시.

drop policy if exists "meal_products_delete_admin" on public.meal_products;
create policy "meal_products_delete_admin"
  on public.meal_products for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
    or public.is_super_admin()
  );
