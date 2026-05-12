import type { SupabaseClient } from '@supabase/supabase-js';

// 활성 학생(profiles.withdrawn_at IS NULL)만 조회하는 student_profiles 쿼리 진입점.
// 사용처: 어드민 영역에서 "다른 학생 목록"을 가져오는 모든 select 쿼리.
// 사용하지 말 것:
//   - /admin/members/withdrawn 등 퇴원생을 명시적으로 보여줘야 하는 화면
//   - 본인 단일 row 조회(.eq('id', user.id).single())
//   - INSERT / UPDATE / DELETE 등 mutation
//
// 호출 예:
//   const { data } = await fromActiveStudents(supabase, `
//     id, seat_number, profiles!inner ( id, name, branch_id )
//   `)
//     .eq('profiles.branch_id', branchId)
//     .order('seat_number', { ascending: true });
//
// 반환 값은 supabase-js 쿼리 빌더이므로 .eq / .ilike / .order / .range 등을 그대로 체이닝할 수 있다.
// columns 인자에 profiles 조인을 포함시키지 않더라도 withdrawn_at 필터는 profiles 테이블 기준으로 적용된다
// (PostgREST가 자동으로 inner join을 구성).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromActiveStudents<T extends string>(supabase: SupabaseClient<any>, columns: T) {
  return supabase.from('student_profiles').select(columns).is('profiles.withdrawn_at', null);
}
