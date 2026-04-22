-- 취소/거절 → 대기/확정 재신청 시 booked_count 증가 처리
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
    ELSIF OLD.status IN ('cancelled', 'rejected') AND NEW.status IN ('pending', 'confirmed') THEN
      UPDATE public.mentoring_slots
      SET booked_count = booked_count + 1, updated_at = now()
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
