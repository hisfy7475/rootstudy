-- 기존 mentoring_application_sync_booked_count 트리거는 감소 방향
-- (pending/confirmed → cancelled/rejected) 만 처리. 어드민이 학생을 대신
-- 신청하는 흐름에서는 기존 row(rejected/cancelled)를 confirmed 로 UPDATE 하는
-- 재신청 경로가 생기는데, 이 경우 booked_count 가 +1 되어야 하지만
-- 현재 트리거가 처리하지 못한다. 양방향을 모두 처리하도록 보강한다.
-- 부가 효과: 기존 학생 측 applyMentoring 의 재신청(UPDATE) 경로 잠재 버그도 해결.

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
    -- 활성(정원 포함) → 비활성: 감소
    IF OLD.status IN ('pending', 'confirmed')
       AND NEW.status IN ('cancelled', 'rejected') THEN
      UPDATE public.mentoring_slots
      SET booked_count = GREATEST(0, booked_count - 1), updated_at = now()
      WHERE id = NEW.slot_id;
    -- 비활성 → 활성: 증가 (어드민 대신 신청 / 재신청 경로)
    ELSIF OLD.status IN ('cancelled', 'rejected')
          AND NEW.status IN ('pending', 'confirmed') THEN
      UPDATE public.mentoring_slots
      SET booked_count = booked_count + 1, updated_at = now()
      WHERE id = NEW.slot_id;
    END IF;
    -- 같은 그룹 내 이동(pending↔confirmed, cancelled↔rejected)은 변동 없음
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

-- 트리거는 기존 정의를 재사용한다 (DROP/CREATE 불필요). 함수 본문만 갱신.

-- 정합성 보정: 과거 재신청(UPDATE) 누락으로 인해 booked_count 가
-- 실제 카운트보다 적게 기록된 슬롯이 있을 수 있으므로 한 번 동기화한다.
UPDATE public.mentoring_slots s
SET booked_count = sub.actual, updated_at = now()
FROM (
  SELECT
    sl.id AS slot_id,
    COALESCE(
      COUNT(a.id) FILTER (WHERE a.status IN ('pending', 'confirmed')),
      0
    ) AS actual
  FROM public.mentoring_slots sl
  LEFT JOIN public.mentoring_applications a ON a.slot_id = sl.id
  GROUP BY sl.id
) sub
WHERE s.id = sub.slot_id
  AND s.booked_count <> sub.actual;
