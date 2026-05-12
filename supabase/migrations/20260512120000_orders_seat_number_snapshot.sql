-- 항목 3 (P0): 신청내역 좌석번호 스냅샷
--
-- 학생이 좌석을 이동하거나 퇴원해도 신청내역에서 당시 좌석을 보존한다.
-- 스냅샷 시점은 "주문/신청 생성" (결제 승인이 아님). 사용자에게 "어떤 좌석에서
-- 신청했는지"가 핵심 비즈니스 정보이기 때문.
--
-- 적용 대상:
--   - meal_orders (급식·모의고사 공용 — meal_products.category 로 구분)
--   - mentoring_applications (멘토링/클리닉/상담)
--
-- race condition 차단을 위해 BEFORE INSERT trigger 가 자동으로
-- student_profiles.seat_number 를 복사한다. 애플리케이션 코드는 컬럼을
-- 명시적으로 set 하지 않아도 되며, 명시한 경우 그 값이 우선한다.

-- ============================================
-- 1. 컬럼 추가
-- ============================================
ALTER TABLE public.meal_orders
  ADD COLUMN IF NOT EXISTS seat_number_snapshot integer;

ALTER TABLE public.mentoring_applications
  ADD COLUMN IF NOT EXISTS seat_number_snapshot integer;

COMMENT ON COLUMN public.meal_orders.seat_number_snapshot IS
  '신청(주문 생성) 시점 student_profiles.seat_number 스냅샷. 학생 좌석 이동·퇴원 후에도 신청 당시 좌석을 보존.';
COMMENT ON COLUMN public.mentoring_applications.seat_number_snapshot IS
  '신청 시점 student_profiles.seat_number 스냅샷.';

-- ============================================
-- 2. 백필 (활성 학생의 현재 좌석으로 best-effort)
--    이동 이력이 있는 학생은 정확하지 않을 수 있으나
--    소급 정확도보다 NULL 노출 최소화가 우선.
-- ============================================
-- student_profiles.id 가 곧 user_id (profiles.id FK)
UPDATE public.meal_orders mo
SET seat_number_snapshot = sp.seat_number
FROM public.student_profiles sp
WHERE sp.id = mo.student_id
  AND mo.seat_number_snapshot IS NULL
  AND sp.seat_number IS NOT NULL;

UPDATE public.mentoring_applications ma
SET seat_number_snapshot = sp.seat_number
FROM public.student_profiles sp
WHERE sp.id = ma.student_id
  AND ma.seat_number_snapshot IS NULL
  AND sp.seat_number IS NOT NULL;

-- ============================================
-- 3. BEFORE INSERT trigger — race-free 자동 채움
-- ============================================
CREATE OR REPLACE FUNCTION public.fill_seat_number_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 애플리케이션이 명시적으로 넣은 값이 있으면 보존
  IF NEW.seat_number_snapshot IS NULL THEN
    SELECT seat_number INTO NEW.seat_number_snapshot
    FROM public.student_profiles
    WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meal_orders_fill_seat_snapshot ON public.meal_orders;
CREATE TRIGGER trg_meal_orders_fill_seat_snapshot
  BEFORE INSERT ON public.meal_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_seat_number_snapshot();

DROP TRIGGER IF EXISTS trg_mentoring_applications_fill_seat_snapshot ON public.mentoring_applications;
CREATE TRIGGER trg_mentoring_applications_fill_seat_snapshot
  BEFORE INSERT ON public.mentoring_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_seat_number_snapshot();

-- ============================================
-- 4. unified_applications view 갱신 — seat_number_snapshot 노출
-- ============================================
CREATE OR REPLACE VIEW public.unified_applications
WITH (security_invoker = true) AS
-- 급식
SELECT
  'meal'::text                                AS domain,
  mo.id                                       AS application_id,
  mo.created_at                               AS applied_at,
  CASE mo.status
    WHEN 'pending'   THEN 'pending'
    WHEN 'paid'      THEN 'completed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'refunded'  THEN 'refunded'
    WHEN 'failed'    THEN 'failed'
    ELSE 'unknown'
  END                                         AS status_normalized,
  mo.status                                   AS status_raw,
  mo.user_id                                  AS user_id,
  mo.student_id                               AS student_id,
  mp.branch_id                                AS branch_id,
  mp.id                                       AS item_id,
  mp.name                                     AS item_name,
  mp.image_url                                AS item_image_url,
  mp.meal_type                                AS sub_category,
  mo.amount                                   AS amount,
  mo.paid_at                                  AS paid_at,
  jsonb_build_object(
    'product_id',            mp.id,
    'variant_id',            mpv.id,
    'variant_kind',          mpv.kind,
    'product_start_date',    mpv.product_start_date,
    'product_end_date',      mpv.product_end_date,
    'order_id',              mo.order_id,
    'tid',                   mo.tid,
    'cancel_reason',         mo.cancel_reason,
    'cancelled_at',          mo.cancelled_at
  )                                           AS meta,
  mo.seat_number_snapshot                     AS seat_number_snapshot
FROM public.meal_orders mo
INNER JOIN public.meal_product_variants mpv ON mpv.id = mo.variant_id
INNER JOIN public.meal_products mp           ON mp.id = mpv.product_id
WHERE mp.category = 'meal'

UNION ALL

-- 모의고사
SELECT
  'exam'::text                                AS domain,
  mo.id                                       AS application_id,
  mo.created_at                               AS applied_at,
  CASE mo.status
    WHEN 'pending'   THEN 'pending'
    WHEN 'paid'      THEN 'completed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'refunded'  THEN 'refunded'
    WHEN 'failed'    THEN 'failed'
    ELSE 'unknown'
  END                                         AS status_normalized,
  mo.status                                   AS status_raw,
  mo.user_id                                  AS user_id,
  mo.student_id                               AS student_id,
  mp.branch_id                                AS branch_id,
  mp.id                                       AS item_id,
  mp.name                                     AS item_name,
  mp.image_url                                AS item_image_url,
  NULL::text                                  AS sub_category,
  mo.amount                                   AS amount,
  mo.paid_at                                  AS paid_at,
  jsonb_build_object(
    'product_id',            mp.id,
    'variant_id',            mpv.id,
    'variant_kind',          mpv.kind,
    'product_start_date',    mpv.product_start_date,
    'product_end_date',      mpv.product_end_date,
    'order_id',              mo.order_id,
    'tid',                   mo.tid,
    'cancel_reason',         mo.cancel_reason,
    'cancelled_at',          mo.cancelled_at
  )                                           AS meta,
  mo.seat_number_snapshot                     AS seat_number_snapshot
FROM public.meal_orders mo
INNER JOIN public.meal_product_variants mpv ON mpv.id = mo.variant_id
INNER JOIN public.meal_products mp           ON mp.id = mpv.product_id
WHERE mp.category = 'exam'

UNION ALL

-- 멘토링/클리닉/상담
SELECT
  'mentoring'::text                           AS domain,
  ma.id                                       AS application_id,
  ma.applied_at                               AS applied_at,
  CASE ma.status
    WHEN 'pending'   THEN 'pending'
    WHEN 'confirmed' THEN 'completed'
    WHEN 'rejected'  THEN 'rejected'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'unknown'
  END                                         AS status_normalized,
  ma.status                                   AS status_raw,
  ma.user_id                                  AS user_id,
  ma.student_id                               AS student_id,
  ms.branch_id                                AS branch_id,
  ms.id                                       AS item_id,
  m.name                                      AS item_name,
  m.profile_image_url                         AS item_image_url,
  ms.type                                     AS sub_category,
  NULL::integer                               AS amount,
  NULL::timestamptz                           AS paid_at,
  jsonb_build_object(
    'slot_id',          ms.id,
    'slot_date',        ms.date,
    'slot_start_time',  ms.start_time,
    'slot_end_time',    ms.end_time,
    'mentor_id',        m.id,
    'mentor_name',      m.name,
    'subject',          ms.subject,
    'selected_subject', ma.selected_subject,
    'type',             ms.type,
    'confirmed_at',     ma.confirmed_at,
    'rejected_at',      ma.rejected_at,
    'reject_reason',    ma.reject_reason,
    'cancel_reason',    ma.cancel_reason,
    'cancelled_at',     ma.cancelled_at
  )                                           AS meta,
  ma.seat_number_snapshot                     AS seat_number_snapshot
FROM public.mentoring_applications ma
INNER JOIN public.mentoring_slots ms ON ms.id = ma.slot_id
LEFT JOIN  public.mentors m          ON m.id = ms.mentor_id
;

COMMENT ON VIEW public.unified_applications IS
  '/admin/applications 통합 신청내역 페이지 데이터 소스. 급식·모의고사·멘토링 신청을 표준 컬럼셋으로 합친다. seat_number_snapshot 은 신청 시점 좌석. branch 격리는 호출자(서버 액션) 책임.';

GRANT SELECT ON public.unified_applications TO authenticated;
