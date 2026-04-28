-- chat_rooms / chat_messages 에 branch_id 비정규화.
-- 목적: 관리자용 SELECT RLS 정책을 단일 컬럼 비교로 단순화하여
--      Supabase Realtime postgres_changes broadcast 가 listener 별 RLS 평가 단계에서
--      차단되지 않도록 한다 (사이드바 채팅 배지 / /admin/chat 목록 realtime 갱신 복구).
-- 학생 전적은 드물어 INSERT 시점 branch_id 를 영구 고정한다.

-- 1) 컬럼 추가 (nullable 시작)
ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- 2) 기존 데이터 backfill (chat_rooms 먼저, 그 값을 chat_messages 가 참조)
UPDATE public.chat_rooms cr
   SET branch_id = p.branch_id
  FROM public.profiles p
 WHERE cr.student_id = p.id
   AND cr.branch_id IS NULL;

UPDATE public.chat_messages cm
   SET branch_id = cr.branch_id
  FROM public.chat_rooms cr
 WHERE cm.room_id = cr.id
   AND cm.branch_id IS NULL;

-- 3) NOT NULL 강제
ALTER TABLE public.chat_rooms  ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.chat_messages ALTER COLUMN branch_id SET NOT NULL;

-- 4) BEFORE INSERT 자동 채움 트리거
CREATE OR REPLACE FUNCTION public.set_chat_rooms_branch_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    SELECT branch_id INTO NEW.branch_id
      FROM public.profiles
     WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_rooms_set_branch_id ON public.chat_rooms;
CREATE TRIGGER chat_rooms_set_branch_id
  BEFORE INSERT ON public.chat_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_chat_rooms_branch_id();

CREATE OR REPLACE FUNCTION public.set_chat_messages_branch_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    SELECT branch_id INTO NEW.branch_id
      FROM public.chat_rooms
     WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_set_branch_id ON public.chat_messages;
CREATE TRIGGER chat_messages_set_branch_id
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_chat_messages_branch_id();

-- 5) 관리자 SELECT RLS 정책을 단일 컬럼 비교로 교체
DROP POLICY IF EXISTS "Admins can view all chat rooms" ON public.chat_rooms;
CREATE POLICY "Admins can view branch chat rooms"
  ON public.chat_rooms
  FOR SELECT
  TO authenticated
  USING (branch_id = public.get_admin_branch_id());

DROP POLICY IF EXISTS "Admins can view all messages" ON public.chat_messages;
CREATE POLICY "Admins can view branch messages"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (branch_id = public.get_admin_branch_id());

-- 6) 인덱스
CREATE INDEX IF NOT EXISTS chat_rooms_branch_id_idx
  ON public.chat_rooms (branch_id);

CREATE INDEX IF NOT EXISTS chat_messages_branch_id_created_at_idx
  ON public.chat_messages (branch_id, created_at DESC);
