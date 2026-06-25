-- 채팅 지점(branch_id) 불일치 구조적 수정.
--
-- 배경:
--   chat_rooms / chat_messages 는 방 생성 시점의 학생 지점으로 branch_id 를 비정규화(박제)한다
--   (20260427120000_chat_branch_denormalization.sql). 이 박제는 Supabase Realtime 이 listener 별
--   RLS 를 WAL row 로 평가하기 때문에, 관리자 SELECT 정책을 단일 컬럼 비교로 만들어 realtime
--   broadcast 가 차단되지 않게 하려는 의도였다. 그러나 INSERT 시점 동기화 트리거만 만들고,
--   학생이 다른 지점으로 전배될 때(회원관리의 "센터" 드롭다운 → updateMember → profiles.branch_id
--   UPDATE) 기존 chat_rooms / chat_messages.branch_id 를 갱신하는 경로가 없었다.
--
--   그 결과 전배된 학생의 방/메시지 박제 지점이 옛 지점에 묶여, 관리자 SELECT(박제 기준)와
--   INSERT/읽음/카운트(학생 profiles JOIN 기준)가 어긋난다 → 지점관리자의 메시지 전송 실패
--   (insert 후 .select() 되읽기 차단) + 미읽음 배지가 안 꺼짐(realtime 읽음 이벤트 미도달).
--
-- 이 마이그레이션:
--   A. profiles.branch_id 변경 시 그 학생의 chat_rooms / chat_messages.branch_id 를 같은
--      트랜잭션에서 자동 동기화하는 트리거 추가 (재발 방지 — INSERT 트리거의 누락된 UPDATE 짝).
--   B. 현재 어긋나 있는 기존 데이터를 학생 현재 지점으로 1회 정정 (백필).

-- ── A. 전배 동기화 트리거 ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_chat_branch_on_student_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER                      -- 비-service-role 경로가 profiles.branch_id 를 바꿔도
SET search_path = public, pg_temp     -- 내부 UPDATE 가 호출자 RLS 에 막히지 않게(guard 함수와 동일 패턴)
AS $$
BEGIN
  -- chat_messages.branch_id 는 NOT NULL 이고 학생은 항상 지점을 가지므로,
  -- 새 지점이 NULL 인 비정상 케이스는 동기화를 건너뛴다(NULL 전파 불가).
  IF NEW.branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- branch_id 만 바꾸는 UPDATE 다. chat_messages 의 guard_chat_messages_update 트리거는
  -- branch_id 를 read_only 검사 목록에 두지 않아 이 변경을 통과시킨다(현행 확인).
  -- 향후 그 guard 에 branch_id 를 추가하면 여기 UPDATE 가 막히므로 함께 검토할 것.
  UPDATE public.chat_rooms
     SET branch_id = NEW.branch_id
   WHERE student_id = NEW.id
     AND branch_id IS DISTINCT FROM NEW.branch_id;

  UPDATE public.chat_messages cm
     SET branch_id = NEW.branch_id
    FROM public.chat_rooms cr
   WHERE cm.room_id = cr.id
     AND cr.student_id = NEW.id
     AND cm.branch_id IS DISTINCT FROM NEW.branch_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_chat_branch ON public.profiles;
CREATE TRIGGER profiles_sync_chat_branch
  AFTER UPDATE OF branch_id ON public.profiles
  FOR EACH ROW
  WHEN (NEW.branch_id IS DISTINCT FROM OLD.branch_id)
  EXECUTE FUNCTION public.sync_chat_branch_on_student_transfer();

-- ── B. 기존 불일치 데이터 백필 ──────────────────────────────────────────────────
-- 특정 건을 하드코딩하지 않고 불일치 전체를 방어적으로 정정한다.
-- (1) 방 지점을 학생 현재 지점으로 → (2) 메시지 지점을 정정된 방 지점으로(soft-deleted 포함).
UPDATE public.chat_rooms cr
   SET branch_id = p.branch_id
  FROM public.profiles p
 WHERE cr.student_id = p.id
   AND p.branch_id IS NOT NULL
   AND cr.branch_id IS DISTINCT FROM p.branch_id;

UPDATE public.chat_messages cm
   SET branch_id = cr.branch_id
  FROM public.chat_rooms cr
 WHERE cm.room_id = cr.id
   AND cm.branch_id IS DISTINCT FROM cr.branch_id;
