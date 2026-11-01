import { fetchBranchStudents, filterByGrade, okJson, withExternalApi } from '@/lib/external-api';

// GET /api/external/v1/students[?grade=고3]
// 인증키 지점의 재원생 명단. 이름은 키 설정(실명/가림)에 따른다.
export async function GET(request: Request) {
  return withExternalApi(request, async (ctx) => {
    const students = filterByGrade(await fetchBranchStudents(ctx), request);
    return okJson(students, { count: students.length });
  });
}
