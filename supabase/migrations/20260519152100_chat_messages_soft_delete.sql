-- ========================================================================
-- chat_messages soft delete: 본인이 보낸 메시지를 발송 후 5분 이내에만
-- 삭제할 수 있도록 deleted_at/deleted_by 컬럼을 추가하고 RLS + 트리거로 가드한다.
--
-- 정책 합성:
--   - 기존 "Users can update read status" UPDATE 정책과 본 마이그레이션의
--     `chat_messages_update_soft_delete` 정책은 PERMISSIVE 로 OR 결합된다.
--   - PERMISSIVE OR 만으로는 sender 가 시간/컬럼 무관하게 우회 가능해
--     `guard_chat_messages_update` 트리거로 컬럼-수준 화이트리스트를 강제한다.
--     허용되는 UPDATE 는 두 가지뿐:
--       (a) 본인 발신 + 5분 이내 + deleted_at/deleted_by 세팅 + 본문/첨부 비우기
--       (b) 참여자 읽음 표시(is_read_by_*) 변경 (그 외 컬럼은 OLD 와 동일)
-- ========================================================================

-- 1) 컬럼 추가
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id);

-- 2) RLS — 본인 5분 이내 soft delete
DROP POLICY IF EXISTS "chat_messages_update_soft_delete" ON public.chat_messages;
CREATE POLICY "chat_messages_update_soft_delete"
  ON public.chat_messages
  FOR UPDATE
  USING (
    sender_id = auth.uid()
    AND deleted_at IS NULL
    AND created_at > now() - interval '5 minutes'
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND created_at > now() - interval '5 minutes'
  );

-- 3) 컬럼-수준 가드 트리거
CREATE OR REPLACE FUNCTION public.guard_chat_messages_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  read_only_changed boolean;
  sender_softdelete boolean;
BEGIN
  -- 읽음 표시만 바뀐 경우 (는 컬럼이 OLD 와 동일하고 is_read_by_* 만 변경)
  read_only_changed :=
    NEW.content    IS NOT DISTINCT FROM OLD.content
    AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url
    AND NEW.file_url  IS NOT DISTINCT FROM OLD.file_url
    AND NEW.file_name IS NOT DISTINCT FROM OLD.file_name
    AND NEW.file_type IS NOT DISTINCT FROM OLD.file_type
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
    AND NEW.deleted_by IS NOT DISTINCT FROM OLD.deleted_by
    AND NEW.sender_id IS NOT DISTINCT FROM OLD.sender_id
    AND NEW.room_id   IS NOT DISTINCT FROM OLD.room_id
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at;

  -- 본인 5분 이내 soft delete 한 정확한 패턴
  sender_softdelete :=
    OLD.sender_id = auth.uid()
    AND OLD.deleted_at IS NULL
    AND OLD.created_at > now() - interval '5 minutes'
    AND NEW.deleted_at IS NOT NULL
    AND NEW.deleted_by = auth.uid()
    AND NEW.sender_id = OLD.sender_id
    AND NEW.room_id   = OLD.room_id
    AND NEW.created_at = OLD.created_at
    -- 읽음 컬럼은 변경하지 않음
    AND NEW.is_read_by_student IS NOT DISTINCT FROM OLD.is_read_by_student
    AND NEW.is_read_by_parent  IS NOT DISTINCT FROM OLD.is_read_by_parent
    AND NEW.is_read_by_admin   IS NOT DISTINCT FROM OLD.is_read_by_admin;

  IF read_only_changed OR sender_softdelete THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'CHAT_MESSAGE_UPDATE_NOT_ALLOWED';
END;
$$;

DROP TRIGGER IF EXISTS guard_chat_messages_update ON public.chat_messages;
CREATE TRIGGER guard_chat_messages_update
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_messages_update();
