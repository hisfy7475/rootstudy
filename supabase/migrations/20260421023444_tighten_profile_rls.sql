-- profiles / student_profiles의 지나치게 넓은 SELECT 정책을 제거하고
-- 학부모-학생 링크 기반의 대칭 정책으로 교체한다.

CREATE OR REPLACE FUNCTION public.is_linked_student(student_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM parent_student_links
    WHERE parent_student_links.student_id = student_profile_id
      AND parent_student_links.parent_id = auth.uid()
  );
$$;

CREATE POLICY "Parents can view linked student profiles"
  ON public.profiles FOR SELECT
  USING (user_type = 'student' AND public.is_linked_student(id));

CREATE POLICY "Parents can view linked student_profiles"
  ON public.student_profiles FOR SELECT
  USING (public.is_linked_student(id));

DROP POLICY IF EXISTS "Anyone can view student name for parent code verification"
  ON public.profiles;
DROP POLICY IF EXISTS "Anyone can verify parent_code"
  ON public.student_profiles;
