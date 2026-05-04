import { getUserScope } from './scope';

export type AdminBranchContext = {
  userId: string;
  /** null = 전 지점 (슈퍼관리자). 일반 어드민은 본인 branch_id 1개. */
  branchId: string | null;
  isSuperAdmin: boolean;
};

/**
 * admin 사용자의 (userId, branchId, isSuperAdmin) 컨텍스트를 반환.
 * - 비로그인, admin 외 사용자 → null
 * - 일반 어드민 + 지점 미지정 → null (현행)
 * - 슈퍼관리자 → branchId: null (= "전 지점, 필터 없음")
 * - 일반 어드민 → branchId: 본인 branch_id
 *
 * `getUserScope()` 가 react.cache 로 같은 요청에서 한 번만 DB 조회.
 *
 * 어드민 페이지·서버 액션에서 인라인 `auth.getUser` + `profiles.branch_id` 조회 블록을
 * 이 한 줄로 대체.
 */
export async function requireAdminBranch(): Promise<AdminBranchContext | null> {
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'admin') return null;
  if (scope.isSuperAdmin) {
    return { userId: scope.userId, branchId: null, isSuperAdmin: true };
  }
  if (scope.branchIds.length === 0) return null;
  return { userId: scope.userId, branchId: scope.branchIds[0], isSuperAdmin: false };
}
