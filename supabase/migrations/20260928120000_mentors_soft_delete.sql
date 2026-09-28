-- 멘토 삭제 기능
-- 일정 이력이 없는 멘토: 행 삭제(DELETE 정책 신설).
-- 이력이 있는 멘토: mentoring_slots.mentor_id 가 ON DELETE RESTRICT 라 행을 지울 수 없고,
-- 지난 신청·결과 기록 보존을 위해 deleted_at 으로 숨김 처리(is_active=false 동반).

ALTER TABLE public.mentors
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.mentors.deleted_at IS
  '관리자 삭제 시각. 값이 있으면 관리자 목록·선택지에서 제외(지난 일정·신청 기록은 유지).';

DROP POLICY IF EXISTS "mentors_delete_admin" ON public.mentors;
CREATE POLICY "mentors_delete_admin"
  ON public.mentors FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );
