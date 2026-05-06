-- ========================================================================
-- get_chat_room_list: p_student_id 인자 추가하여 단일 방 조회 모드 지원
-- ------------------------------------------------------------------------
-- 출석부·통합검색·푸시 딥링크 등 외부 진입점이 학생 ID만으로 단일 채팅방
-- 메타데이터(student_name·seat_number·unread_count·last_message·...)를
-- 같은 shape 으로 가져올 수 있게 한다. 기존 호출자(어드민 채팅 페이지의
-- 좌측 목록 무한스크롤·검색)는 p_student_id => NULL 기본값으로 영향 없음.
--
-- 시그니처가 변경되므로 PostgREST 오버로드 충돌을 피하기 위해 기존 4-인자
-- 정의를 명시적으로 DROP 후 5-인자 정의를 CREATE OR REPLACE 한다.
-- 마이그레이션은 단일 트랜잭션이라 다운타임 없이 안전하다.
-- ========================================================================

DROP FUNCTION IF EXISTS public.get_chat_room_list(integer, integer, text, uuid);

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
