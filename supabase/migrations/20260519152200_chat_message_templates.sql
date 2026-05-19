-- ========================================================================
-- chat_message_templates: 관리자가 자주 쓰는 멘트를 사전 등록해두는 개인별 템플릿.
-- 1차 범위: 관리자만 INSERT, 본인 행만 SELECT/UPDATE/DELETE.
-- 1인당 최대 30개(BEFORE INSERT count 트리거 — 동시 INSERT 시 ±1~2개 오차 허용).
-- Realtime publication 추가 안 함 — 다중 탭 동기화 불필요, Popover 열 때마다 재조회.
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.chat_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 30),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_templates_user_sort
  ON public.chat_message_templates (user_id, sort_order, created_at);

ALTER TABLE public.chat_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_templates_owner_select" ON public.chat_message_templates;
CREATE POLICY "chat_templates_owner_select"
  ON public.chat_message_templates
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_templates_owner_insert" ON public.chat_message_templates;
CREATE POLICY "chat_templates_owner_insert"
  ON public.chat_message_templates
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "chat_templates_owner_update" ON public.chat_message_templates;
CREATE POLICY "chat_templates_owner_update"
  ON public.chat_message_templates
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_templates_owner_delete" ON public.chat_message_templates;
CREATE POLICY "chat_templates_owner_delete"
  ON public.chat_message_templates
  FOR DELETE
  USING (user_id = auth.uid());

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.touch_chat_template_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_template_touch_updated_at ON public.chat_message_templates;
CREATE TRIGGER chat_template_touch_updated_at
  BEFORE UPDATE ON public.chat_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_chat_template_updated_at();

-- 30개 제한 트리거. 정확도가 더 필요하면 향후
-- `pg_advisory_xact_lock(hashtext(NEW.user_id::text))` 를 본문 상단에 추가.
CREATE OR REPLACE FUNCTION public.enforce_chat_template_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT count(*) FROM public.chat_message_templates WHERE user_id = NEW.user_id) >= 30 THEN
    RAISE EXCEPTION 'TEMPLATE_LIMIT_EXCEEDED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_template_limit_trigger ON public.chat_message_templates;
CREATE TRIGGER chat_template_limit_trigger
  BEFORE INSERT ON public.chat_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_template_limit();
