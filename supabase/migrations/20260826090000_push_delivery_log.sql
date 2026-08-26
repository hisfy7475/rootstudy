-- 푸시 발송 로그 + Expo 영수증(receipt) 확인용 테이블.
--
-- 배경: 지금까지 푸시는 Expo 에 던진 뒤 응답의 ticket 만 검사했다. 그런데 Expo 는
--       "단말에 실제로 못 넣었다"(DeviceNotRegistered = 앱 삭제/알림 끔/토큰 만료)를
--       대부분 ticket 이 아니라 15분쯤 뒤에 조회하는 receipt 로 알려준다. 그래서
--         ① 앱을 지운 사용자의 토큰이 push_tokens.is_active=true 로 영원히 남고
--         ② "알림이 안 온다" 문의가 오면 보냈는지 여부조차 확인할 방법이 없었다.
--       (2026-08-26 반포 129번 학생 학부모 문의 대응 — 원인 규명에 운영 DB 직접 조회가 필요했다)
--
--       이 테이블에 "토큰 1개 = 1행"으로 발송 기록을 남기고, push-receipts 크론이
--       15분 뒤 receipt 를 조회해 상태를 확정한다. DeviceNotRegistered 면 토큰을 비활성화한다.
--
-- 상태(status)
--   accepted     : Expo 가 접수(ticket ok). 아직 단말 도달 여부는 모름 → 크론이 확정한다.
--   ticket_error : 접수 단계에서 거절(잘못된 토큰 형식 등). 즉시 확정.
--   delivered    : receipt ok. 푸시 서비스(APNs/FCM)까지 전달 완료.
--   failed       : receipt error. error_code 에 사유(DeviceNotRegistered/MessageTooBig 등).
--   unknown      : 24시간이 지나 Expo 가 영수증을 만료시킨 건. 확인 불가로 종결.

CREATE TABLE IF NOT EXISTS public.push_delivery_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expo_push_token text NOT NULL,
  title text,
  ticket_id text,
  status text NOT NULL CHECK (status IN ('accepted', 'ticket_error', 'delivered', 'failed', 'unknown')),
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  receipt_checked_at timestamptz
);

COMMENT ON TABLE public.push_delivery_log IS
  '푸시 발송 기록(토큰 단위). push-receipts 크론이 Expo 영수증으로 최종 상태를 확정하고, 보관 기간(30일)이 지난 행은 같은 크론이 정리한다.';

-- 영수증 미확정분 스윕용. status='accepted' 만 대상이라 부분 인덱스로 충분하다.
CREATE INDEX IF NOT EXISTS idx_push_delivery_log_pending
  ON public.push_delivery_log (created_at)
  WHERE status = 'accepted';

-- 관리자 문의 대응 — "이 사용자에게 최근 뭘 보냈고 도달했나" 조회.
CREATE INDEX IF NOT EXISTS idx_push_delivery_log_user
  ON public.push_delivery_log (user_id, created_at DESC);

-- 보관 기간 경과분 삭제용.
CREATE INDEX IF NOT EXISTS idx_push_delivery_log_created_at
  ON public.push_delivery_log (created_at);

-- 서비스 롤(발송 코드·크론) 전용. 클라이언트가 직접 읽을 일이 없으므로
-- 정책을 두지 않는다(RLS 활성 + 정책 0 = 전면 차단). 관리자 화면은 서버 액션에서
-- service-role 클라이언트로 조회한다.
ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;
