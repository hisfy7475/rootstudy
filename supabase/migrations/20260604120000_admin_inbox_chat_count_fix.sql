-- ========================================================================
-- 관리자 "알림 관리" 본인 수신함 전환에 따른 보강 + 채팅 배지 정합성 수정.
--
-- (a) get_admin_unread_chat_count: 채팅 배지 카운트를 채팅방 목록(get_chat_room_list)과
--     정합화한다. 목록은 p.is_approved = true 를 요구하지만 카운트 RPC 는 빠져 있어,
--     승인 해제(updateStudentApprovalStatus 로 '대기/비승인')된 미퇴원 학생의 미읽음
--     메시지가 "배지엔 잡히는데 목록엔 안 떠 읽음 처리 불가"한 phantom 으로 남을 수 있다.
--     슈퍼/일반 두 분기 WHERE 에 AND p.is_approved = true 를 추가한다.
--     (나머지 deleted_at / withdrawn_at / branch 필터는 20260519152300 본문 유지.)
--
-- (b) 관리자 user_notifications 누적 미읽음 1회성 정리(backfill). 기존엔 본인 알림을
--     읽음 처리할 UI 가 없어 멘토링/상담 신청 접수 알림(type='system')과 오래된 chat
--     알림이 미읽음으로 쌓여 사이드바 배지가 영구히 줄지 않았다.
-- ========================================================================

-- (a) 채팅 미읽음 카운트 RPC — is_approved 정합성 추가
CREATE OR REPLACE FUNCTION public.get_admin_unread_chat_count()
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_branch uuid;
  v_is_super boolean;
BEGIN
  SELECT branch_id, is_super_admin
    INTO v_admin_branch, v_is_super
    FROM public.profiles
   WHERE id = auth.uid() AND user_type = 'admin';
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_is_super THEN
    RETURN (
      SELECT COUNT(*)::bigint
      FROM public.chat_messages cm
      JOIN public.chat_rooms cr ON cr.id = cm.room_id
      JOIN public.student_profiles sp ON sp.id = cr.student_id
      JOIN public.profiles p ON p.id = sp.id
      WHERE cm.is_read_by_admin = false
        AND cm.deleted_at IS NULL
        AND p.withdrawn_at IS NULL
        AND p.is_approved = true
    );
  END IF;

  RETURN (
    SELECT COUNT(*)::bigint
    FROM public.chat_messages cm
    JOIN public.chat_rooms cr ON cr.id = cm.room_id
    JOIN public.student_profiles sp ON sp.id = cr.student_id
    JOIN public.profiles p ON p.id = sp.id
    WHERE cm.is_read_by_admin = false
      AND cm.deleted_at IS NULL
      AND p.withdrawn_at IS NULL
      AND p.is_approved = true
      AND p.branch_id = v_admin_branch
  );
END;
$$;

-- CREATE OR REPLACE 는 기존 grant 를 보존하므로(anon=X 잔존) 실행 권한을 재명시한다.
REVOKE EXECUTE ON FUNCTION public.get_admin_unread_chat_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_unread_chat_count() TO authenticated;

-- (b) 관리자 누적 미읽음 정리 (1회성)
UPDATE public.user_notifications un
   SET is_read = true
  FROM public.profiles p
 WHERE p.id = un.user_id
   AND p.user_type = 'admin'
   AND un.is_read = false;
