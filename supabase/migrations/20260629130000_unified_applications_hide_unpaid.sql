-- unified_applications VIEW 갱신 — 미결제 급식·모의고사 주문 숨김.
--
-- 배경: 결제 페이지 "카드 결제하기" 시점에 meal_orders pending 행이 생성되는데(meal.ts startMealPayment),
--       결제창이 깨지거나(흰화면) 사용자가 인증 전 이탈하면 ReturnURL POST 가 confirm 라우트에 도달하지 못해
--       pending(tid=null) 이 "유령 주문"으로 잔존한다. 이게 관리자 통합 신청내역에 "신청 대기"로 노출됐다.
--
-- 정책: "신청"은 결제가 성립해야 성립한다. 미결제(pending)·실패(failed)는 신청이 아니므로
--       급식·모의고사 도메인에서 view 자체에서 제외하고, 결제가 성립한 paid/cancelled/refunded 만 노출한다.
--       (학생/학부모 본인 주문내역은 meal_orders 직접 조회라 view 와 무관 → "결제 계속하기" resume 유지.)
--
-- 멘토링: mentoring_applications 기반이며 pending = "승인 대기"(결제 무관 정상 상태)이므로 무변경.
--
-- ⚠️ CREATE OR REPLACE VIEW 제약:
--    - 컬럼 이름/순서/타입은 기존(20260615140707)과 100% 동일해야 함(변경 시 42P16). 본 변경은 WHERE 절만 수정.
--    - WITH (security_invoker = true) 를 반드시 유지. 생략 시 default(false)로 리셋되어 RLS 우회 회귀.

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
  NULL::text                                  AS option_summary,
  p.name                                      AS student_name
FROM public.meal_orders mo
INNER JOIN public.meal_product_variants mpv ON mpv.id = mo.variant_id
INNER JOIN public.meal_products mp           ON mp.id = mpv.product_id
LEFT JOIN  public.profiles p                 ON p.id = mo.student_id
-- 결제 성립 건만 노출(미결제 pending·실패 failed 제외 → "신청 대기" 잔존 숨김).
WHERE mp.category = 'meal' AND mo.status IN ('paid', 'cancelled', 'refunded')

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
  END                                         AS option_summary,
  p.name                                      AS student_name
FROM public.meal_orders mo
INNER JOIN public.meal_product_variants mpv ON mpv.id = mo.variant_id
INNER JOIN public.meal_products mp           ON mp.id = mpv.product_id
LEFT JOIN  public.profiles p                 ON p.id = mo.student_id
-- 결제 성립 건만 노출(미결제 pending·실패 failed 제외).
WHERE mp.category = 'exam' AND mo.status IN ('paid', 'cancelled', 'refunded')

UNION ALL

-- ============================================
-- 멘토링/클리닉/상담 (mentoring_applications) — 결제 무관, pending=승인 대기. 무변경.
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
  NULL::text                                  AS option_summary,
  p.name                                      AS student_name
FROM public.mentoring_applications ma
INNER JOIN public.mentoring_slots ms ON ms.id = ma.slot_id
LEFT JOIN  public.mentors m          ON m.id = ms.mentor_id
LEFT JOIN  public.profiles p         ON p.id = ma.student_id
;

COMMENT ON VIEW public.unified_applications IS
  '/admin/applications 통합 신청내역 페이지 데이터 소스. 급식·모의고사·멘토링 신청을 표준 컬럼셋으로 합친다. 급식·모의고사는 결제 성립(paid/cancelled/refunded) 건만 노출하며 미결제 pending·실패 failed 는 제외한다(유령 신청대기 숨김). 멘토링은 pending=승인 대기로 그대로 노출. service_start_date 는 이용일 시작 기준 (meal/exam: product_start_date, mentoring: slot.date). option_summary 는 exam 도메인의 선택 옵션 요약(다른 도메인은 NULL). student_name 은 학생 정렬용 컬럼(표시는 서버 액션 hydration). branch 격리는 호출자(서버 액션) 책임.';

GRANT SELECT ON public.unified_applications TO authenticated;
