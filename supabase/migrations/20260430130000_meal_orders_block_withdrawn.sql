-- meal_orders INSERT 정책에 활성 학생 조건을 추가한다.
-- 어플리케이션 레이어 가드(createMealOrder)와 별개로 RLS 차원에서도
-- 퇴원 학생(profiles.withdrawn_at IS NOT NULL) 대상 신규 주문을 거부한다.
-- 결제자(user_id) 활성 여부는 미들웨어/Auth ban 으로 막히므로 여기선 student_id 만 검사.

DROP POLICY IF EXISTS "meal_orders_insert_own" ON public.meal_orders;
CREATE POLICY "meal_orders_insert_own"
  ON public.meal_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid())
    AND (
      (student_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.parent_student_links psl
        WHERE psl.parent_id = auth.uid()
          AND psl.student_id = meal_orders.student_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles s
      WHERE s.id = meal_orders.student_id
        AND s.withdrawn_at IS NULL
    )
  );
