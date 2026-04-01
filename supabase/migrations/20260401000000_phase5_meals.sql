-- Phase 5: 급식 신청/결제 (학생·학부모)

-- 급식 상품
CREATE TABLE IF NOT EXISTS public.meal_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  name text NOT NULL,
  meal_type text NOT NULL CHECK (meal_type IN ('lunch', 'dinner')),
  price integer NOT NULL CHECK (price >= 0),
  sale_start_date date NOT NULL,
  sale_end_date date NOT NULL,
  meal_start_date date NOT NULL,
  meal_end_date date NOT NULL,
  max_capacity integer CHECK (max_capacity IS NULL OR max_capacity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'sold_out')),
  description text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 일별 메뉴
CREATE TABLE IF NOT EXISTS public.meal_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.meal_products(id) ON DELETE CASCADE,
  date date NOT NULL,
  menu_text text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (product_id, date)
);

-- 급식 주문
CREATE TABLE IF NOT EXISTS public.meal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.meal_products(id) ON DELETE RESTRICT,
  order_id text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded', 'failed')),
  tid text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meal_orders_user ON public.meal_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_meal_orders_student ON public.meal_orders (student_id);
CREATE INDEX IF NOT EXISTS idx_meal_orders_product ON public.meal_orders (product_id);
CREATE INDEX IF NOT EXISTS idx_meal_orders_order_id ON public.meal_orders (order_id);

-- 결제 로그 (공용)
CREATE TABLE IF NOT EXISTS public.payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_type text NOT NULL CHECK (order_type IN ('meal', 'exam', 'other')),
  order_id text NOT NULL,
  tid text,
  action text NOT NULL CHECK (action IN ('auth', 'approve', 'cancel', 'webhook', 'netcancel')),
  amount integer,
  status text NOT NULL,
  result_code text,
  result_msg text,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_order ON public.payment_logs (order_type, order_id);

-- RLS
ALTER TABLE public.meal_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

-- meal_products: 인증 사용자 조회, 관리자만 쓰기
DROP POLICY IF EXISTS "meal_products_select_authenticated" ON public.meal_products;
CREATE POLICY "meal_products_select_authenticated"
  ON public.meal_products FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "meal_products_insert_admin" ON public.meal_products;
CREATE POLICY "meal_products_insert_admin"
  ON public.meal_products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "meal_products_update_admin" ON public.meal_products;
CREATE POLICY "meal_products_update_admin"
  ON public.meal_products FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- meal_menus
DROP POLICY IF EXISTS "meal_menus_select_authenticated" ON public.meal_menus;
CREATE POLICY "meal_menus_select_authenticated"
  ON public.meal_menus FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "meal_menus_insert_admin" ON public.meal_menus;
CREATE POLICY "meal_menus_insert_admin"
  ON public.meal_menus FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "meal_menus_update_admin" ON public.meal_menus;
CREATE POLICY "meal_menus_update_admin"
  ON public.meal_menus FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "meal_menus_delete_admin" ON public.meal_menus;
CREATE POLICY "meal_menus_delete_admin"
  ON public.meal_menus FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- meal_orders: 본인·자녀(학부모) 조회, 본인 INSERT, 본인·관리자 UPDATE
DROP POLICY IF EXISTS "meal_orders_select_own_or_admin" ON public.meal_orders;
CREATE POLICY "meal_orders_select_own_or_admin"
  ON public.meal_orders FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      WHERE psl.parent_id = auth.uid() AND psl.student_id = meal_orders.student_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "meal_orders_insert_own" ON public.meal_orders;
CREATE POLICY "meal_orders_insert_own"
  ON public.meal_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      student_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.parent_student_links psl
        WHERE psl.parent_id = auth.uid() AND psl.student_id = meal_orders.student_id
      )
    )
  );

DROP POLICY IF EXISTS "meal_orders_update_own_or_admin" ON public.meal_orders;
CREATE POLICY "meal_orders_update_own_or_admin"
  ON public.meal_orders FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- 결제 전(pending) 주문만 본인 삭제 허용 (결제창 이탈 시 정리)
DROP POLICY IF EXISTS "meal_orders_delete_own_pending" ON public.meal_orders;
CREATE POLICY "meal_orders_delete_own_pending"
  ON public.meal_orders FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

-- payment_logs: 관리자만 SELECT (INSERT는 service_role 전용 — anon/authenticated 정책 없음)
DROP POLICY IF EXISTS "payment_logs_select_admin" ON public.payment_logs;
CREATE POLICY "payment_logs_select_admin"
  ON public.payment_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );
