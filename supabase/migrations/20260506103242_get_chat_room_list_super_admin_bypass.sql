-- ========================================================================
-- get_chat_room_list: 슈퍼어드민 branch 가드 우회 추가
-- ------------------------------------------------------------------------
-- 기존 RPC 는 p_admin_id 의 branch 와 학생 branch 가 일치해야만 결과를 반환했다.
-- chat_rooms RLS 와 chat_messages RLS 는 이미 슈퍼어드민(`is_super_admin()`)
-- 분기를 갖고 있어 슈퍼어드민이 모든 지점 채팅방을 SELECT 할 수 있는데, RPC
-- 만 분기가 없어 슈퍼어드민이 다른 지점 학생의 단일 채팅방 조회 시 빈 결과를
-- 반환했다. 출석부 → 채팅 진입(`?studentId=...`) 시 다른 지점 학생 클릭 케이스
-- 에서 `initialSelectedRoom = null` 이 되어 "채팅방을 선택해주세요" 빈 상태로
-- 표시되는 회귀의 직접 원인.
--
-- 해결: RPC 의 branch 일치 조건에 `is_super_admin = true` OR 분기 추가.
-- 영향 범위:
--   - 일반 어드민: 동작 변화 없음 (branch 일치 조건 그대로 적용)
--   - 슈퍼어드민: 모든 지점 채팅방을 좌측 목록·단일 조회 모두 정상 조회
-- ========================================================================

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
      OR COALESCE(
           (SELECT is_super_admin FROM profiles WHERE id = p_admin_id LIMIT 1),
           false
         ) = true
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
