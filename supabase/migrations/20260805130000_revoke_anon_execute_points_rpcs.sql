-- 상벌점 RPC 의 anon / PUBLIC 실행 권한 회수
--
-- 배경
--   Postgres 는 함수 생성 시 PUBLIC 에 EXECUTE 를 기본 부여한다. 이 저장소의 기존
--   마이그레이션들은 `GRANT ... TO authenticated, service_role` 만 하고 REVOKE 를
--   하지 않아, 기본 PUBLIC 권한과 (Supabase 가 PUBLIC 에 준) anon 권한이 그대로 남았다.
--
--   20260805120000 에서 give_penalty_with_threshold_check / handle_penalty_threshold /
--   preview_penalty / maybe_revert_penalty_offset 는 회수했으나, 같은 배포에서 재정의한
--   아래 두 함수가 누락됐다. 프로덕션 ACL 실측으로 확인 후 회수한다.
--
--   - cancel_point       : SECURITY DEFINER + 내부 인가 검사 없음.
--                          anon 키만으로 임의 point 를 취소할 수 있었다(취소 행 INSERT +
--                          상계 되돌리기 + 퇴원 마크 해제까지 연쇄).
--   - points_summary     : 내부에 admin 검사가 있어 실피해는 없으나 기본값을 답습하지 않는다.
--
-- 호출부 확인 (전수 grep)
--   cancel_point   → src/lib/actions/admin.ts (관리자 서버 액션, authenticated)
--   points_summary → src/lib/actions/admin.ts (관리자 서버 액션, authenticated)
--   anon 컨텍스트에서 호출하는 경로는 없다. service_role(크론)도 GRANT 를 유지한다.

REVOKE ALL ON FUNCTION public.cancel_point(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_point(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_point(uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.points_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.points_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.points_summary(uuid) TO authenticated;

-- 남은 과제 (별도 범위 — 상품권 발급 도메인)
--   아래 함수들도 SECURITY DEFINER + 내부 인가 검사 없음 + anon 실행 가능 상태다.
--   호출부는 전부 인증된 서버 액션이라 같은 방식으로 회수하면 되지만, 이번 상계 변경이
--   건드리지 않은 영역이므로 확인 후 별도 마이그레이션으로 처리한다.
--     issue_redemption, request_redemption, cancel_withdrawal_review,
--     ensure_redemption_slots, cleanup_redemption_slots
