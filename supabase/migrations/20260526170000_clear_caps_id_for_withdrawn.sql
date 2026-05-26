-- 탈퇴된 학생이 점유 중인 caps_id 를 NULL 로 일괄 정리.
--
-- 배경: student_profiles.caps_id 에 전역 UNIQUE 제약이 걸려 있어,
-- 탈퇴 후에도 caps_id 를 보존하면 다른(또는 재가입한 동명이인) 학생에게
-- 같은 caps_id 를 부여할 수 없음. 향후 탈퇴(softDeleteUser)는 caps_id 를
-- 자동 클리어하므로, 본 마이그레이션은 과거 누적분만 1회성 정리.
UPDATE public.student_profiles AS sp
SET caps_id = NULL,
    caps_id_set_at = NULL
FROM public.profiles AS p
WHERE p.id = sp.id
  AND p.withdrawn_at IS NOT NULL
  AND sp.caps_id IS NOT NULL;
