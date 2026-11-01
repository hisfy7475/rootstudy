-- 외부 연동 API(사이니지 등) 인증키 + 호출 제한.
--
-- 배경: 2026-10-28 클라이언트 요청 — 센터 40인치 모니터(사이니지)에 누적 상점 순위·
--       N수생/고3/고2 주간 순공시간 순위를 띄우려고, 외부 업체가 읽어 갈 조회 API 가 필요.
--       기존 서버는 앱 화면 전용이라 외부 공개 경로가 없었다. /api/external/v1/* 가
--       이 테이블의 키로만 접근을 허용한다.
--
-- 설계
--   - 키 원문은 저장하지 않는다. 발급 시 1회만 보여 주고 sha256 해시만 남긴다.
--   - 키 1개 = 지점 1개. 응답은 항상 그 지점 학생으로 한정된다(센터별 조회 범위 제한).
--   - name_display: 외부 업체에 넘길 학생 이름 형태. 'masked'(홍*동) 가 기본.
--   - 호출 제한: 키당 1분 고정 창(external_api_usage). 한도는 키별 rate_limit_per_minute.
--
-- 서비스 롤 전용. RLS 활성 + 정책 0 = 클라이언트 직접 접근 전면 차단.
-- 관리자 화면은 서버 액션(최고 관리자 검증 후 서비스 롤)으로 다룬다.

CREATE TABLE IF NOT EXISTS public.external_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  name_display text NOT NULL DEFAULT 'masked' CHECK (name_display IN ('full', 'masked')),
  rate_limit_per_minute int NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute > 0),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.external_api_keys IS
  '외부 연동 API 인증키. 원문 미저장(sha256 해시만). 키 1개 = 지점 1개 조회 범위. revoked_at 이 있으면 폐기된 키.';

CREATE INDEX IF NOT EXISTS idx_external_api_keys_branch
  ON public.external_api_keys (branch_id);

ALTER TABLE public.external_api_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.external_api_usage (
  key_id uuid NOT NULL REFERENCES public.external_api_keys(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);

COMMENT ON TABLE public.external_api_usage IS
  '외부 연동 API 호출 수(키·1분 창 단위). 호출 제한 판정용. 하루 지난 행은 authorize 함수가 정리한다.';

ALTER TABLE public.external_api_usage ENABLE ROW LEVEL SECURITY;

-- 키 검증 + 호출 수 증가를 한 번에 처리한다 (라우트당 DB 왕복 1회).
-- 반환: 키가 없거나 폐기됐으면 0행. 있으면 1행 + allowed(한도 이내 여부).
CREATE OR REPLACE FUNCTION public.external_api_authorize(p_key_hash text)
RETURNS TABLE (
  key_id uuid,
  branch_id uuid,
  name_display text,
  allowed boolean,
  request_count int,
  rate_limit_per_minute int,
  window_reset_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key public.external_api_keys%ROWTYPE;
  v_window timestamptz := date_trunc('minute', now());
  v_count int;
BEGIN
  SELECT * INTO v_key
    FROM public.external_api_keys k
   WHERE k.key_hash = p_key_hash
     AND k.revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.external_api_usage AS u (key_id, window_start, request_count)
  VALUES (v_key.id, v_window, 1)
  -- 컬럼 목록 대신 제약 이름 — RETURNS TABLE 의 key_id 와 이름이 겹쳐 모호성 오류가 난다
  ON CONFLICT ON CONSTRAINT external_api_usage_pkey
  DO UPDATE SET request_count = u.request_count + 1
  RETURNING u.request_count INTO v_count;

  UPDATE public.external_api_keys SET last_used_at = now() WHERE id = v_key.id;

  -- 오래된 집계 정리 (해당 키만, 가볍게)
  DELETE FROM public.external_api_usage
   WHERE external_api_usage.key_id = v_key.id
     AND window_start < now() - interval '1 day';

  RETURN QUERY SELECT
    v_key.id,
    v_key.branch_id,
    v_key.name_display,
    v_count <= v_key.rate_limit_per_minute,
    v_count,
    v_key.rate_limit_per_minute,
    v_window + interval '1 minute';
END $$;

REVOKE ALL ON FUNCTION public.external_api_authorize(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.external_api_authorize(text) TO service_role;

-- 지점 학생별 누적 획득 상점.
-- earned_total 은 관리자 points_summary.reward_lifetime 과 같은 식이다
-- (상품권 교환·상계·소멸·취소 행을 빼기 전의 획득 합, 재입반 초기화 이후분).
-- 두 식이 갈리면 사이니지 순위와 관리자 화면 숫자가 달라지므로 함께 고칠 것.
CREATE OR REPLACE FUNCTION public.external_points_summary(p_branch_id uuid)
RETURNS TABLE (
  student_id uuid,
  earned_total int,
  balance int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sp.id,
    COALESCE(SUM(CASE WHEN pt.type = 'reward'
                       AND pt.event_kind NOT IN (
                             'redeem','reset_on_threshold','reset_on_threshold_revert',
                             'manual_cancel','offset_against_penalty','offset_against_penalty_revert')
                      THEN pt.amount ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN pt.type = 'reward' THEN pt.amount ELSE 0 END), 0)::int
  FROM public.student_profiles sp
  JOIN public.profiles p ON p.id = sp.id
  LEFT JOIN public.points pt
    ON pt.student_id = sp.id
   AND pt.event_kind <> 'reset_on_reenroll'
   AND (sp.points_reset_at IS NULL OR pt.created_at >= sp.points_reset_at)
  WHERE p.branch_id = p_branch_id
    AND p.user_type = 'student'
    AND p.is_approved = true
    AND p.withdrawn_at IS NULL
  GROUP BY sp.id;
$$;

REVOKE ALL ON FUNCTION public.external_points_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.external_points_summary(uuid) TO service_role;
