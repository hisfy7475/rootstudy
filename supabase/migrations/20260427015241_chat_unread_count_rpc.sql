-- ========================================================================
-- 1) Drift 복구: get_chat_room_list 정의를 dev DB 본문 기반으로 repo 에 박제
--    (search_path 안전화 추가는 SECURITY DEFINER 컨벤션 정렬용 — auth_branch_ids() 패턴)
-- ========================================================================
CREATE OR REPLACE FUNCTION public.get_chat_room_list(
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL::text,
  p_admin_id uuid DEFAULT NULL::uuid
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
    COUNT(*) FILTER (WHERE cm.id IS NOT NULL AND NOT cm.is_read_by_admin) AS unread_count,
    (
      SELECT cm2.content
      FROM chat_messages cm2
      WHERE cm2.room_id = cr.id
      ORDER BY cm2.created_at DESC
      LIMIT 1
    ) AS last_message,
    COALESCE(
      (
        SELECT cm3.created_at
        FROM chat_messages cm3
        WHERE cm3.room_id = cr.id
        ORDER BY cm3.created_at DESC
        LIMIT 1
      ),
      cr.created_at
    ) AS last_message_at
  FROM chat_rooms cr
  JOIN student_profiles sp ON sp.id = cr.student_id
  JOIN profiles p ON p.id = sp.id
  LEFT JOIN chat_messages cm ON cm.room_id = cr.id
  WHERE
    p.is_approved = true
    AND (p_search IS NULL OR p_search = '' OR p.name ILIKE '%' || p_search || '%')
    AND (
      p_admin_id IS NULL
      OR p.branch_id = (
        SELECT branch_id FROM profiles WHERE id = p_admin_id LIMIT 1
      )
    )
  GROUP BY cr.id, cr.student_id, cr.created_at, p.name, sp.seat_number
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_chat_room_list(integer, integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_room_list(integer, integer, text, uuid) TO authenticated;

-- ========================================================================
-- 2) 신규: 관리자 미확인 채팅 카운트 (auth.uid() 기반, 자기 지점만)
-- ========================================================================
CREATE OR REPLACE FUNCTION public.get_admin_unread_chat_count()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT COUNT(*)::bigint
  FROM chat_messages cm
  JOIN chat_rooms cr ON cr.id = cm.room_id
  JOIN student_profiles sp ON sp.id = cr.student_id
  JOIN profiles p ON p.id = sp.id
  WHERE cm.is_read_by_admin = false
    AND p.branch_id = (
      SELECT branch_id
      FROM profiles
      WHERE id = auth.uid()
        AND user_type = 'admin'
      LIMIT 1
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_admin_unread_chat_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_unread_chat_count() TO authenticated;
