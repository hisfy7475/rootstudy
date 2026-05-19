-- ========================================================================
-- 메시지 soft delete 도입에 따른 카운트/last_message RPC 보강.
-- 발신자가 5분 내 삭제한 메시지가 수신자 unread_count 에 남거나
-- last_message 본문으로 노출되는 회귀를 막기 위해 `deleted_at IS NULL` 필터를
-- get_chat_room_list, get_admin_unread_chat_count 양쪽에 추가한다.
--
-- 시그니처/return shape/grant 는 20260506103242 와 20260504013901 본문을 그대로
-- 유지하고 필터만 추가. 슈퍼관리자 분기도 보존.
-- ========================================================================

-- 1) get_chat_room_list (p_student_id 포함 5-arg)
CREATE OR REPLACE FUNCTION public.get_chat_room_list(
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL::text,
  p_admin_id uuid DEFAULT NULL::uuid,
  p_student_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid,
  student_id uuid,
  created_at timestamp with time zone,
  student_name text,
  seat_number integer,
  unread_count bigint,
  last_message text,
  last_message_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    cr.id,
    cr.student_id,
    cr.created_at,
    p.name AS student_name,
    sp.seat_number,
    COUNT(*) FILTER (
      WHERE cm.id IS NOT NULL
        AND NOT cm.is_read_by_admin
        AND cm.deleted_at IS NULL
    ) AS unread_count,
    (
      SELECT cm2.content FROM chat_messages cm2
      WHERE cm2.room_id = cr.id
        AND cm2.deleted_at IS NULL
      ORDER BY cm2.created_at DESC LIMIT 1
    ) AS last_message,
    COALESCE(
      (
        SELECT cm3.created_at FROM chat_messages cm3
        WHERE cm3.room_id = cr.id
          AND cm3.deleted_at IS NULL
        ORDER BY cm3.created_at DESC LIMIT 1
      ),
      cr.created_at
    ) AS last_message_at
  FROM chat_rooms cr
  JOIN student_profiles sp ON sp.id = cr.student_id
  JOIN profiles p ON p.id = sp.id
  LEFT JOIN chat_messages cm
    ON cm.room_id = cr.id
   AND cm.deleted_at IS NULL
  WHERE
    p.is_approved = true
    AND p.withdrawn_at IS NULL
    AND (p_search IS NULL OR p_search = '' OR p.name ILIKE '%' || p_search || '%')
    AND (
      p_admin_id IS NULL
      OR EXISTS (
        SELECT 1 FROM profiles ap
        WHERE ap.id = p_admin_id
          AND ap.user_type = 'admin'
          AND ap.is_super_admin = true
      )
      OR p.branch_id = (
        SELECT branch_id FROM profiles WHERE id = p_admin_id LIMIT 1
      )
    )
    AND (p_student_id IS NULL OR cr.student_id = p_student_id)
  GROUP BY cr.id, cr.student_id, cr.created_at, p.name, sp.seat_number
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_chat_room_list(integer, integer, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_room_list(integer, integer, text, uuid, uuid) TO authenticated;

-- 2) get_admin_unread_chat_count — 슈퍼/일반 분기 모두에 deleted_at IS NULL 필터 추가
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
      AND p.branch_id = v_admin_branch
  );
END;
$$;
