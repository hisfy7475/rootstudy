-- 통합 신청내역 VIEW 에 이용일·이용시간 일급 컬럼 추가.
-- 검색 기준이 "신청일(applied_at)" → "이용일(service_start_date)" 으로 전환되면서
-- 도메인별로 다른 의미의 날짜를 표준 컬럼명으로 노출.
--
-- 매핑:
--   meal      : mpv.product_start_date / mpv.product_end_date, 시간 NULL
--   exam      : mpv.product_start_date / mpv.product_end_date, 시간 NULL
--   mentoring : ms.date (start/end 동일), ms.start_time, ms.end_time
--
-- service_start_date 는 underlying INNER JOIN 으로 인해 NOT NULL 가정 가능.
-- security_invoker = true 유지로 RLS 호환 보존.
--
-- ⚠️ 컬럼 순서 주의: CREATE OR REPLACE VIEW 는 기존 컬럼 reorder 시
--    "cannot change name of view column" (42P16) 으로 실패한다. 신규 4개 컬럼은
--    반드시 기존 마지막 컬럼인 seat_number_snapshot 다음(맨 끝)에 추가한다.

CREATE OR REPLACE VIEW public.unified_applications
WITH (security_invoker = true) AS
-- ============================================
-- 급식 (meal_products.category = 'meal')
-- ============================================
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
  mo.seat_number_snapshot                     AS seat_number_snapshot,
  mpv.product_start_date                      AS service_start_date,
  mpv.product_end_date                        AS service_end_date,
  NULL::time                                  AS service_start_time,
  NULL::time                                  AS service_end_time
FROM public.meal_orders mo
INNER JOIN public.meal_product_variants mpv ON mpv.id = mo.variant_id
INNER JOIN public.meal_products mp           ON mp.id = mpv.product_id
WHERE mp.category = 'meal'

UNION ALL

-- ============================================
-- 모의고사 (meal_products.category = 'exam')
-- ============================================
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
  mo.seat_number_snapshot                     AS seat_number_snapshot,
  mpv.product_start_date                      AS service_start_date,
  mpv.product_end_date                        AS service_end_date,
  NULL::time                                  AS service_start_time,
  NULL::time                                  AS service_end_time
FROM public.meal_orders mo
INNER JOIN public.meal_product_variants mpv ON mpv.id = mo.variant_id
INNER JOIN public.meal_products mp           ON mp.id = mpv.product_id
WHERE mp.category = 'exam'

UNION ALL

-- ============================================
-- 멘토링/클리닉/상담 (mentoring_applications)
-- ============================================
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
  ma.seat_number_snapshot                     AS seat_number_snapshot,
  ms.date                                     AS service_start_date,
  ms.date                                     AS service_end_date,
  ms.start_time                               AS service_start_time,
  ms.end_time                                 AS service_end_time
FROM public.mentoring_applications ma
INNER JOIN public.mentoring_slots ms ON ms.id = ma.slot_id
LEFT JOIN  public.mentors m          ON m.id = ms.mentor_id
;

COMMENT ON VIEW public.unified_applications IS
  '/admin/applications 통합 신청내역 페이지 데이터 소스. 급식·모의고사·멘토링 신청을 표준 컬럼셋으로 합친다. service_start_date 는 이용일 시작 기준 (meal/exam: product_start_date, mentoring: slot.date). 검색·정렬에 사용한다. branch 격리는 호출자(서버 액션) 책임.';

GRANT SELECT ON public.unified_applications TO authenticated;
