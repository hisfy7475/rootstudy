import { createAdminClient } from '@/lib/supabase/server';
import { fetchBranchStudents, filterByGrade, okJson, withExternalApi } from '@/lib/external-api';

// GET /api/external/v1/points[?grade=고3]
// 학생별 누적 획득 상점. earned_total = 상품권 교환에 쓴 점수까지 포함한 총 획득(관리자 화면 '총 획득'과 같은 값),
// balance = 현재 남은 상점. 재입반 초기화가 있었던 학생은 초기화 이후분만 센다.
export async function GET(request: Request) {
  return withExternalApi(request, async (ctx) => {
    const students = filterByGrade(await fetchBranchStudents(ctx), request);
    const { data, error } = await createAdminClient().rpc('external_points_summary', {
      p_branch_id: ctx.branchId,
    });
    if (error) throw new Error(`external_points_summary: ${error.message}`);

    const byId = new Map(
      (data as Array<{ student_id: string; earned_total: number; balance: number }>).map((r) => [
        r.student_id,
        r,
      ]),
    );
    const rows = students
      .map((s) => ({
        ...s,
        earned_total: byId.get(s.id)?.earned_total ?? 0,
        balance: byId.get(s.id)?.balance ?? 0,
      }))
      .sort((a, b) => b.earned_total - a.earned_total);
    return okJson(rows, { count: rows.length });
  });
}
