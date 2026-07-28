-- auto_vocab(영단어 주간 개근 상점) 을 하드 삭제 보호 대상에 추가.
--
-- 배경: 개근 상점 부여 시 학생·학부모에게 알림을 보내기 시작했는데(awardVocabReward),
--       관리자가 points 행을 하드 삭제하면 "상점이 부여되었습니다" 알림만 남고 점수는 사라진다.
--       부수 효과로, 삭제 후 주말 재응시 시 uq_points_vocab_daily 충돌이 사라져 2점이
--       중복 부여되던 기존 경로도 함께 막힌다.
--
-- 취소(cancel_point)는 의도적으로 계속 허용한다. 잘못 부여된 건을 되돌릴 경로가 아예 없으면
-- 운영이 막히기 때문이며, 취소는 음수 행을 INSERT 하는 append-only 방식이라 이력이 남고
-- 알림과도 모순되지 않는다. (auto_daily_focus 는 취소까지 막혀 있으나 그 정책을 답습하지 않는다)

CREATE OR REPLACE FUNCTION public.protect_points_event_kind_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.event_kind IN (
    'reset_on_threshold',
    'reset_on_threshold_revert',
    'redeem',
    'manual_cancel',
    'auto_daily_focus',
    'auto_vocab'
  ) THEN
    RAISE EXCEPTION 'points 행은 event_kind=% 라 삭제할 수 없습니다. cancel_point RPC 로 취소 행 INSERT 하세요. (id=%)',
      OLD.event_kind, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;
