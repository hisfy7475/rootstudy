-- 항목 3: KST 기준 현재 분기 시작 시각 함수
--
-- 분기 경계: 3/1, 6/1, 9/1, 12/1 00:00 KST
-- 1·2월은 직전 12/1 시작 (회계연도 12월 시작)
--
-- TS 측 src/lib/utils.ts:getCurrentQuarterStartKST 와 결과 동일해야 함.

CREATE OR REPLACE FUNCTION public.get_current_quarter_start_kst()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now_kst timestamp;
  v_year int;
  v_month int;
  v_q_year int;
  v_q_month int;
BEGIN
  v_now_kst := (now() AT TIME ZONE 'Asia/Seoul')::timestamp;
  v_year := extract(year FROM v_now_kst)::int;
  v_month := extract(month FROM v_now_kst)::int;

  IF v_month IN (3, 4, 5) THEN
    v_q_year := v_year; v_q_month := 3;
  ELSIF v_month IN (6, 7, 8) THEN
    v_q_year := v_year; v_q_month := 6;
  ELSIF v_month IN (9, 10, 11) THEN
    v_q_year := v_year; v_q_month := 9;
  ELSIF v_month = 12 THEN
    v_q_year := v_year; v_q_month := 12;
  ELSE  -- 1, 2월: 직전 12/1
    v_q_year := v_year - 1; v_q_month := 12;
  END IF;

  RETURN (make_date(v_q_year, v_q_month, 1)::timestamp AT TIME ZONE 'Asia/Seoul');
END $$;

COMMENT ON FUNCTION public.get_current_quarter_start_kst() IS
  'KST 기준 현재 분기(3/6/9/12월 시작) 시작 시각. 1·2월은 직전 12/1.';

GRANT EXECUTE ON FUNCTION public.get_current_quarter_start_kst() TO authenticated;


-- 임의 시점의 분기 시작도 지원 (테스트·과거 조회용)
CREATE OR REPLACE FUNCTION public.get_quarter_start_for_kst(p_at timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_kst timestamp;
  v_year int;
  v_month int;
  v_q_year int;
  v_q_month int;
BEGIN
  v_kst := (p_at AT TIME ZONE 'Asia/Seoul')::timestamp;
  v_year := extract(year FROM v_kst)::int;
  v_month := extract(month FROM v_kst)::int;

  IF v_month IN (3, 4, 5) THEN
    v_q_year := v_year; v_q_month := 3;
  ELSIF v_month IN (6, 7, 8) THEN
    v_q_year := v_year; v_q_month := 6;
  ELSIF v_month IN (9, 10, 11) THEN
    v_q_year := v_year; v_q_month := 9;
  ELSIF v_month = 12 THEN
    v_q_year := v_year; v_q_month := 12;
  ELSE
    v_q_year := v_year - 1; v_q_month := 12;
  END IF;

  RETURN (make_date(v_q_year, v_q_month, 1)::timestamp AT TIME ZONE 'Asia/Seoul');
END $$;

GRANT EXECUTE ON FUNCTION public.get_quarter_start_for_kst(timestamptz) TO authenticated;
