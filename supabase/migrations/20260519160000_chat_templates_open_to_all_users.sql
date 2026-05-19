-- ========================================================================
-- chat_message_templates: 관리자 한정 INSERT 정책을 전 인증 사용자로 확장.
-- 학생·학부모도 본인 템플릿을 만들 수 있도록 user_type 가드 제거.
-- 본인 행만 CRUD 가능한 제약(user_id = auth.uid())은 유지.
-- ========================================================================

DROP POLICY IF EXISTS "chat_templates_owner_insert" ON public.chat_message_templates;
CREATE POLICY "chat_templates_owner_insert"
  ON public.chat_message_templates
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
