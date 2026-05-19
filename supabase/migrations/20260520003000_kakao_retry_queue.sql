-- 백로그 6: critical 알림톡 재시도 큐
--
-- 25/30점 도달 같은 critical 학부모 알림톡 발송 실패 시 enqueue.
-- 별도 cron 이 주기적으로 재시도. 3회 실패 시 관리자 사내 알림.

CREATE TABLE IF NOT EXISTS public.kakao_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  -- critical 분류: 'penalty_warn25' | 'penalty_threshold30' | 'redemption_issued' | ...
  category text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed_final')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  succeeded_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_kakao_retry_pending
  ON public.kakao_retry_queue (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_kakao_retry_parent
  ON public.kakao_retry_queue (parent_id, status, created_at DESC);

-- RLS: 관리자만 SELECT (운영 추적), service role 만 INSERT/UPDATE
ALTER TABLE public.kakao_retry_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS krq_admin_select ON public.kakao_retry_queue;
CREATE POLICY krq_admin_select ON public.kakao_retry_queue
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_type = 'admin'
  ));

COMMENT ON TABLE public.kakao_retry_queue IS
  'critical 알림톡 발송 실패 재시도 큐. 최대 3회 backoff(5분/30분/2시간) 후 failed_final.';
