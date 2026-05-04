-- 슈퍼관리자 RLS 바이패스.
-- 9개 테이블의 admin RLS 가 `branch_id = get_admin_branch_id()` 로 잠겨 있어
-- 슈퍼관리자도 자신의 home branch 외 데이터를 보거나 수정할 수 없었다.
-- is_super_admin() 헬퍼를 추가하고 영향 받는 모든 policy 의 qual/with_check 에
-- `OR public.is_super_admin()` 을 OR 로 결합한다. 일반 어드민 동작은 변경 없음.
--
-- 영향 정책 (테이블 — policy):
--   attendance — Admins can insert attendance / Admins can view all attendance
--   chat_messages — Admins can send messages to any room / Admins can view branch messages / Users can update read status
--   chat_rooms — Admins can create chat rooms / Admins can view branch chat rooms
--   focus_scores — Admins can manage all focus scores
--   notifications — Admins can view branch notifications
--   points — Admins can manage all points
--   profiles — Admins can view all profiles / Admins can update student and parent profiles
--   student_absence_schedules — Admins can manage all absence schedules
--   student_profiles — Admins can view all student_profiles / Admins can update student_profiles

-- =============================================
-- 헬퍼: is_super_admin()
-- =============================================
create or replace function public.is_super_admin()
returns boolean
language sql
stable security definer
as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- =============================================
-- attendance
-- =============================================
drop policy if exists "Admins can insert attendance" on public.attendance;
create policy "Admins can insert attendance" on public.attendance
  for insert
  with check (
    (get_user_type() = 'admin')
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = attendance.student_id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  );

drop policy if exists "Admins can view all attendance" on public.attendance;
create policy "Admins can view all attendance" on public.attendance
  for select
  using (
    (get_user_type() = 'admin')
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = attendance.student_id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  );

-- =============================================
-- chat_messages
-- =============================================
drop policy if exists "Admins can send messages to any room" on public.chat_messages;
create policy "Admins can send messages to any room" on public.chat_messages
  for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.user_type = 'admin'
    )
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.chat_rooms
        join public.profiles on profiles.id = chat_rooms.student_id
        where chat_rooms.id = chat_messages.room_id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  );

drop policy if exists "Admins can view branch messages" on public.chat_messages;
create policy "Admins can view branch messages" on public.chat_messages
  for select
  using (
    public.is_super_admin()
    or chat_messages.branch_id = get_admin_branch_id()
  );

drop policy if exists "Users can update read status" on public.chat_messages;
create policy "Users can update read status" on public.chat_messages
  for update
  using (
    exists (
      select 1 from public.chat_rooms
      where chat_rooms.id = chat_messages.room_id
        and (
          chat_rooms.student_id = auth.uid()
          or exists (
            select 1 from public.parent_student_links
            where parent_student_links.student_id = chat_rooms.student_id
              and parent_student_links.parent_id = auth.uid()
          )
          or (
            exists (
              select 1 from public.profiles
              where profiles.id = auth.uid() and profiles.user_type = 'admin'
            )
            and (
              public.is_super_admin()
              or exists (
                select 1 from public.profiles
                where profiles.id = chat_rooms.student_id
                  and profiles.branch_id = get_admin_branch_id()
              )
            )
          )
        )
    )
  );

-- =============================================
-- chat_rooms
-- =============================================
drop policy if exists "Admins can create chat rooms" on public.chat_rooms;
create policy "Admins can create chat rooms" on public.chat_rooms
  for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.user_type = 'admin'
    )
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = chat_rooms.student_id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  );

drop policy if exists "Admins can view branch chat rooms" on public.chat_rooms;
create policy "Admins can view branch chat rooms" on public.chat_rooms
  for select
  using (
    public.is_super_admin()
    or chat_rooms.branch_id = get_admin_branch_id()
  );

-- =============================================
-- focus_scores
-- =============================================
drop policy if exists "Admins can manage all focus scores" on public.focus_scores;
create policy "Admins can manage all focus scores" on public.focus_scores
  for all
  using (
    (get_user_type() = 'admin')
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = focus_scores.student_id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  )
  with check (
    (get_user_type() = 'admin')
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = focus_scores.student_id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  );

-- =============================================
-- notifications
-- =============================================
drop policy if exists "Admins can view branch notifications" on public.notifications;
create policy "Admins can view branch notifications" on public.notifications
  for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.user_type = 'admin'
    )
    and (
      public.is_super_admin()
      or notifications.branch_id = get_admin_branch_id()
    )
  );

-- =============================================
-- points
-- =============================================
drop policy if exists "Admins can manage all points" on public.points;
create policy "Admins can manage all points" on public.points
  for all
  using (
    (get_user_type() = 'admin')
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = points.student_id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  )
  with check (
    (get_user_type() = 'admin')
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = points.student_id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  );

-- =============================================
-- profiles
-- =============================================
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles" on public.profiles
  for select
  using (
    (get_user_type() = 'admin')
    and (
      public.is_super_admin()
      or branch_id = get_admin_branch_id()
    )
  );

drop policy if exists "Admins can update student and parent profiles" on public.profiles;
create policy "Admins can update student and parent profiles" on public.profiles
  for update
  using (
    (get_user_type() = 'admin')
    and (user_type = any (array['student'::text, 'parent'::text]))
    and (
      public.is_super_admin()
      or branch_id = get_admin_branch_id()
    )
  )
  with check (
    (get_user_type() = 'admin')
    and (user_type = any (array['student'::text, 'parent'::text]))
    and (
      public.is_super_admin()
      or branch_id = get_admin_branch_id()
    )
  );

-- =============================================
-- student_absence_schedules
-- =============================================
drop policy if exists "Admins can manage all absence schedules" on public.student_absence_schedules;
create policy "Admins can manage all absence schedules" on public.student_absence_schedules
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.user_type = 'admin'
    )
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = student_absence_schedules.student_id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.user_type = 'admin'
    )
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = student_absence_schedules.student_id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  );

-- =============================================
-- student_profiles
-- =============================================
drop policy if exists "Admins can view all student_profiles" on public.student_profiles;
create policy "Admins can view all student_profiles" on public.student_profiles
  for select
  using (
    (get_user_type() = 'admin')
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = student_profiles.id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  );

drop policy if exists "Admins can update student_profiles" on public.student_profiles;
create policy "Admins can update student_profiles" on public.student_profiles
  for update
  using (
    (get_user_type() = 'admin')
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = student_profiles.id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  )
  with check (
    (get_user_type() = 'admin')
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles
        where profiles.id = student_profiles.id
          and profiles.branch_id = get_admin_branch_id()
      )
    )
  );
