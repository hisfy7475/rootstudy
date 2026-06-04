-- 첨부 업로드 한도 50MB 통일.
--
-- 배경: 웹 첨부가 그동안 Next.js 서버 액션(FormData)을 경유했는데, Vercel 서버 액션
-- 본문 하드캡(~4.5MB) 때문에 4MB 이상 파일이 서버에 닿기도 전에 거부됐다. 웹을
-- 브라우저 → Supabase Storage 직접 업로드로 전환하면서, 버킷 file_size_limit도
-- 코드 상수(50MB)와 일치시킨다. file_size_limit은 버킷 레벨에서 강제되므로,
-- 코드 상수만 올리고 이 값을 두면 50MB 미만에서 413으로 막힌다.
--
-- allowed_mime_types는 변경하지 않는다(이미지 버킷의 image 4종 화이트리스트 유지 — 위조 차단 방어선).

update storage.buckets
set file_size_limit = 52428800 -- 50 * 1024 * 1024
where id in (
  'chat-images',
  'chat-files',
  'mentoring-attachments',
  'mentoring-files',
  'announcement-files',
  'meal-images'
);
