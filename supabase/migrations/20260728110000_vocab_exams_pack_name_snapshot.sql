-- 영단어 응시 이력에 "응시 시점 꾸러미명" 스냅샷 추가.
--
-- 배경: vocab_exams 는 pack_id FK 만 갖고 이름을 스냅샷하지 않는데,
--       RLS "vocab_packs read" 가 (admin OR status in ('public','preparing')) 라
--       관리자가 꾸러미를 disabled 로 바꾸는 순간 학생·학부모 세션에서는 조인 결과가
--       NULL 이 되어 과거 응시 이력의 제목이 통째로 사라진다.
--       (2026-07-27 '수능 핵심 영단어(테스트용)' 비활성화로 응시 82건/학생 25명 발생)
--       문항은 english_snapshot / answer_snapshot 으로 이미 스냅샷하고 있으므로
--       헤더도 같은 정책으로 맞춘다. 꾸러미 rename 에도 이력이 보존되는 효과가 있다.

ALTER TABLE public.vocab_exams
  ADD COLUMN IF NOT EXISTS pack_name_snapshot text;

COMMENT ON COLUMN public.vocab_exams.pack_name_snapshot IS
  '응시 시점 꾸러미명 스냅샷. 학생·학부모 RLS 는 public/preparing 꾸러미만 읽히므로 관리자가 disabled 로 바꾸면 조인이 NULL 이 되어 과거 이력 제목이 사라진다. 문항의 english_snapshot/answer_snapshot 과 같은 정책. 꾸러미 rename 에도 이력 보존.';

-- 기존 행 백필. pack_id 는 NOT NULL + FK(ON DELETE RESTRICT) 이므로 전 행이 채워진다.
UPDATE public.vocab_exams e
SET pack_name_snapshot = p.name
FROM public.vocab_packs p
WHERE p.id = e.pack_id
  AND e.pack_name_snapshot IS NULL;

-- [안전장치] 마이그레이션 적용 ~ 앱 배포 사이에 생기는 행이 영구 NULL 로 남지 않도록 트리거로 보강한다.
-- 백필 UPDATE 는 1회성이라 갭 행을 덮지 못한다. 앱(startVocabExam)도 값을 넣지만 여기가 최종 방어선.
CREATE OR REPLACE FUNCTION public.set_vocab_exam_pack_name_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pack_name_snapshot IS NULL THEN
    SELECT name INTO NEW.pack_name_snapshot
    FROM public.vocab_packs
    WHERE id = NEW.pack_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vocab_exams_pack_name_snapshot ON public.vocab_exams;
CREATE TRIGGER trg_vocab_exams_pack_name_snapshot
  BEFORE INSERT ON public.vocab_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.set_vocab_exam_pack_name_snapshot();
