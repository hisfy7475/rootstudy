-- 어드민 목록 페이지 페이지네이션·필터·정렬용 인덱스 보강.
-- 기존 단일 인덱스는 대부분 student_id / created_at 단독.
-- 페이지당 20행 + 필터 조합을 효과적으로 처리하려면 복합이 필요.

-- points: branch_id 컬럼 없음. RLS 가 profiles join 으로 branch 격리.
-- 정렬·필터 조합은 (type, created_at desc) + (student_id, created_at desc).
create index if not exists idx_points_type_created_at
  on public.points (type, created_at desc);
create index if not exists idx_points_student_id_created_at
  on public.points (student_id, created_at desc);

-- announcements: branch_id 단독 + created_at desc 단독은 이미 있음.
-- branch 별 정렬을 위해 복합 추가.
create index if not exists idx_announcements_branch_id_created_at
  on public.announcements (branch_id, created_at desc);

-- meal_products: category 단독만 존재. branch + category 복합 + 정렬.
create index if not exists idx_meal_products_branch_category_created_at
  on public.meal_products (branch_id, category, created_at desc);

-- focus_scores: student_id 단독만 있음. 시간 범위 쿼리 보강.
create index if not exists idx_focus_scores_student_recorded_at
  on public.focus_scores (student_id, recorded_at desc);

-- student_absence_schedules: status 단독만 있음.
-- 학생별 정렬, 상태별 정렬 보강.
create index if not exists idx_absence_schedules_student_created_at
  on public.student_absence_schedules (student_id, created_at desc);
create index if not exists idx_absence_schedules_status_created_at
  on public.student_absence_schedules (status, created_at desc);

-- profiles: 회원 페이지 정렬 (지점 + 사용자 유형 + 가입 시각).
create index if not exists idx_profiles_branch_user_type_created_at
  on public.profiles (branch_id, user_type, created_at desc);
