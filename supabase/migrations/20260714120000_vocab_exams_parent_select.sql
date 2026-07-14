-- 학부모가 연결된 자녀의 영단어 시험(vocab_exams)을 조회할 수 있도록 SELECT 정책 추가.
-- 배경: vocab_exams RLS 에는 student own(ALL) / admin(SELECT) 정책만 있어
--       몰입도 리포트를 RLS 클라이언트로 조회할 때 학부모는 자녀 시험을 못 읽어
--       영단어 결과 카드가 빈 상태로 나온다. focus_scores·points 등 다른 리포트
--       테이블의 학부모 정책과 동일 패턴으로 자녀 행만 열어준다.
drop policy if exists "vocab_exams parent" on public.vocab_exams;
create policy "vocab_exams parent" on public.vocab_exams for select
using (
  ((select get_user_type()) = 'parent') and exists (
    select 1 from public.parent_student_links
    where parent_student_links.parent_id = (select auth.uid())
      and parent_student_links.student_id = vocab_exams.student_id
  )
);
