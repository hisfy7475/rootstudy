-- Phase 7: 멘토링/클리닉 신청 (학생·학부모)

-- 멘토
CREATE TABLE IF NOT EXISTS public.mentors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  name text NOT NULL,
  subject text,
  bio text,
  profile_image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 슬롯
CREATE TABLE IF NOT EXISTS public.mentoring_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  mentor_id uuid NOT NULL REFERENCES public.mentors(id) ON DELETE RESTRICT,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  type text NOT NULL CHECK (type IN ('mentoring', 'clinic')),
  subject text,
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  booked_count integer NOT NULL DEFAULT 0 CHECK (booked_count >= 0),
  location text,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 신청
CREATE TABLE IF NOT EXISTS public.mentoring_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.mentoring_slots(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  note text,
  reject_reason text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_mentoring_slots_branch_date ON public.mentoring_slots (branch_id, date);
CREATE INDEX IF NOT EXISTS idx_mentoring_slots_mentor_date ON public.mentoring_slots (mentor_id, date);
CREATE INDEX IF NOT EXISTS idx_mentoring_applications_slot ON public.mentoring_applications (slot_id);
CREATE INDEX IF NOT EXISTS idx_mentoring_applications_student ON public.mentoring_applications (student_id);
CREATE INDEX IF NOT EXISTS idx_mentoring_applications_user ON public.mentoring_applications (user_id);

-- booked_count 동기화 (pending·confirmed 가 정원에 포함)
CREATE OR REPLACE FUNCTION public.mentoring_application_sync_booked_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('pending', 'confirmed') THEN
      UPDATE public.mentoring_slots
      SET booked_count = booked_count + 1, updated_at = now()
      WHERE id = NEW.slot_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('pending', 'confirmed') AND NEW.status IN ('cancelled', 'rejected') THEN
      UPDATE public.mentoring_slots
      SET booked_count = GREATEST(0, booked_count - 1), updated_at = now()
      WHERE id = NEW.slot_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('pending', 'confirmed') THEN
      UPDATE public.mentoring_slots
      SET booked_count = GREATEST(0, booked_count - 1), updated_at = now()
      WHERE id = OLD.slot_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS mentoring_application_sync_booked_count_ins ON public.mentoring_applications;
CREATE TRIGGER mentoring_application_sync_booked_count_ins
  AFTER INSERT ON public.mentoring_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.mentoring_application_sync_booked_count();

DROP TRIGGER IF EXISTS mentoring_application_sync_booked_count_upd ON public.mentoring_applications;
CREATE TRIGGER mentoring_application_sync_booked_count_upd
  AFTER UPDATE ON public.mentoring_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.mentoring_application_sync_booked_count();

DROP TRIGGER IF EXISTS mentoring_application_sync_booked_count_del ON public.mentoring_applications;
CREATE TRIGGER mentoring_application_sync_booked_count_del
  AFTER DELETE ON public.mentoring_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.mentoring_application_sync_booked_count();

-- RLS
ALTER TABLE public.mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoring_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoring_applications ENABLE ROW LEVEL SECURITY;

-- mentors
DROP POLICY IF EXISTS "mentors_select_authenticated" ON public.mentors;
CREATE POLICY "mentors_select_authenticated"
  ON public.mentors FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "mentors_insert_admin" ON public.mentors;
CREATE POLICY "mentors_insert_admin"
  ON public.mentors FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "mentors_update_admin" ON public.mentors;
CREATE POLICY "mentors_update_admin"
  ON public.mentors FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- mentoring_slots
DROP POLICY IF EXISTS "mentoring_slots_select_authenticated" ON public.mentoring_slots;
CREATE POLICY "mentoring_slots_select_authenticated"
  ON public.mentoring_slots FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "mentoring_slots_insert_admin" ON public.mentoring_slots;
CREATE POLICY "mentoring_slots_insert_admin"
  ON public.mentoring_slots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "mentoring_slots_update_admin" ON public.mentoring_slots;
CREATE POLICY "mentoring_slots_update_admin"
  ON public.mentoring_slots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "mentoring_slots_delete_admin" ON public.mentoring_slots;
CREATE POLICY "mentoring_slots_delete_admin"
  ON public.mentoring_slots FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- mentoring_applications
DROP POLICY IF EXISTS "mentoring_applications_select_own_or_admin" ON public.mentoring_applications;
CREATE POLICY "mentoring_applications_select_own_or_admin"
  ON public.mentoring_applications FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      WHERE psl.parent_id = auth.uid() AND psl.student_id = mentoring_applications.student_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "mentoring_applications_insert_own" ON public.mentoring_applications;
CREATE POLICY "mentoring_applications_insert_own"
  ON public.mentoring_applications FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      student_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.parent_student_links psl
        WHERE psl.parent_id = auth.uid() AND psl.student_id = mentoring_applications.student_id
      )
    )
  );

DROP POLICY IF EXISTS "mentoring_applications_update_own_or_admin" ON public.mentoring_applications;
CREATE POLICY "mentoring_applications_update_own_or_admin"
  ON public.mentoring_applications FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      WHERE psl.parent_id = auth.uid() AND psl.student_id = mentoring_applications.student_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      WHERE psl.parent_id = auth.uid() AND psl.student_id = mentoring_applications.student_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "mentoring_applications_delete_admin" ON public.mentoring_applications;
CREATE POLICY "mentoring_applications_delete_admin"
  ON public.mentoring_applications FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );
