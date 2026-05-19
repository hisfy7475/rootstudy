-- 항목 1 사전공지: 정책 동의 이력
--
-- 학생/학부모가 신규 가입 첫 로그인 시 정책 모달을 본 적이 있는지 판정.
-- 정책 버전이 올라가면 다시 모달 노출.

CREATE TABLE IF NOT EXISTS public.policy_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_policy_ack_user
  ON public.policy_acknowledgements (user_id, policy_version);

ALTER TABLE public.policy_acknowledgements ENABLE ROW LEVEL SECURITY;

-- 본인 행 SELECT/INSERT
DROP POLICY IF EXISTS pa_self_select ON public.policy_acknowledgements;
CREATE POLICY pa_self_select ON public.policy_acknowledgements
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS pa_self_insert ON public.policy_acknowledgements;
CREATE POLICY pa_self_insert ON public.policy_acknowledgements
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 관리자: 운영용 SELECT
DROP POLICY IF EXISTS pa_admin_select ON public.policy_acknowledgements;
CREATE POLICY pa_admin_select ON public.policy_acknowledgements
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_type = 'admin'
  ));

COMMENT ON TABLE public.policy_acknowledgements IS
  '학생/학부모의 정책 동의 이력. policy_version 단위. 모달 표시 여부 판정용.';
