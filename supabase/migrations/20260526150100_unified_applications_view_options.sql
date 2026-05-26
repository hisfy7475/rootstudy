-- unified_applications VIEW 갱신.
-- 모의고사 옵션 시스템 도입에 따라:
--   1) exam 분기의 meta JSONB 에 option_selections 키 추가
--   2) view 컬럼 끝에 option_summary text top-level 컬럼 추가
--      (관리자 통합 신청내역 페이지에서 옵션 필터/정렬 용이성 확보)
--
-- option_summary 포맷:
--   - meal/mentoring: NULL
--   - exam: "유형: 현장 · 영역: 과탐" 처럼 그룹별 슬래시 없이 단일값만 결합
--          (옵션 선택은 그룹당 하나)
--
-- ⚠️ 컬럼 순서 주의: CREATE OR REPLACE VIEW 는 기존 컬럼 reorder 시
--    "cannot change name of view column" (42P16) 으로 실패한다. 신규 컬럼은
--    반드시 기존 마지막 컬럼인 service_end_time 다음(맨 끝)에 추가한다.

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
  NULL::time                                  AS service_end_time,
  NULL::text                                  AS option_summary
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
    'cancelled_at',          mo.cancelled_at,
    'option_selections',     mo.option_selections
  )                                           AS meta,
  mo.seat_number_snapshot                     AS seat_number_snapshot,
  mpv.product_start_date                      AS service_start_date,
  mpv.product_end_date                        AS service_end_date,
  NULL::time                                  AS service_start_time,
  NULL::time                                  AS service_end_time,
  -- option_summary: "유형: 현장 · 영역: 과탐" 식으로 결합
  CASE
    WHEN mo.option_selections is null
      or jsonb_typeof(mo.option_selections) <> 'array'
      or jsonb_array_length(mo.option_selections) = 0
    THEN NULL
    ELSE (
      SELECT string_agg(
               (s->>'group_name') || ': ' || (s->>'option_name'),
               ' · '
             )
        FROM jsonb_array_elements(mo.option_selections) s
    )
  END                                         AS option_summary
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
  ms.end_time                                 AS service_end_time,
  NULL::text                                  AS option_summary
FROM public.mentoring_applications ma
INNER JOIN public.mentoring_slots ms ON ms.id = ma.slot_id
LEFT JOIN  public.mentors m          ON m.id = ms.mentor_id
;

COMMENT ON VIEW public.unified_applications IS
  '/admin/applications 통합 신청내역 페이지 데이터 소스. 급식·모의고사·멘토링 신청을 표준 컬럼셋으로 합친다. service_start_date 는 이용일 시작 기준 (meal/exam: product_start_date, mentoring: slot.date). option_summary 는 exam 도메인의 선택 옵션 요약(다른 도메인은 NULL). branch 격리는 호출자(서버 액션) 책임.';

GRANT SELECT ON public.unified_applications TO authenticated;
