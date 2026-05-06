-- chat_messages: 동일 메시지 2중 INSERT 방어용 client_message_id 컬럼 + partial unique index.
-- 클라이언트가 발송 시 crypto.randomUUID()로 생성한 uuid를 함께 넘겨,
-- 동일 (sender_id, client_message_id) 재시도가 unique_violation(23505)으로 흡수되도록 한다.
-- 기존 row는 NULL로 남겨도 partial 인덱스가 무시하므로 백필 불필요.

ALTER TABLE public.chat_messages ADD COLUMN client_message_id uuid;

CREATE UNIQUE INDEX chat_messages_sender_client_id_uniq
  ON public.chat_messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
