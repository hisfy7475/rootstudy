import { getUserScope } from './scope';

export type AdminBranchContext = { userId: string; branchId: string };

/**
 * admin 사용자의 (userId, branchId) 컨텍스트를 반환.
 * - 비로그인, admin 외 사용자, branch 미할당 admin → null
 * - `getUserScope()` 가 react.cache 로 같은 요청에서 한 번만 DB 조회
 *
 * 어드민 페이지·서버 액션에서 인라인 `auth.getUser` + `profiles.branch_id` 조회 블록을
 * 이 한 줄로 대체.
 */
export async function requireAdminBranch(): Promise<AdminBranchContext | null> {
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'admin' || scope.branchIds.length === 0) {
    return null;
  }
  return { userId: scope.userId, branchId: scope.branchIds[0] };
}
