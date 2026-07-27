-- 날짜 타입에 "자율등원" 개념 추가.
--
-- 배경: 주말·공휴일은 의무등원이 아닌 자율등원인데, 지각/조기퇴실 자동 벌점 판정
-- (src/lib/attendance/penalty.ts) 에는 요일·공휴일 분기가 없었다. date_assignments 에
-- 타입만 배정돼 있으면 토·일도 평일과 동일하게 의무 시작시각 + 유예 10분으로 지각이
-- 부과된다. 게다가 default_start_time 이 NOT NULL 이라 "의무시간 없는 타입" 자체를
-- 만들 수 없어, 관리자가 이를 끌 수단이 지점 전체 auto_enabled 토글밖에 없었다.
--
-- 이 컬럼이 false 인 날짜 타입이 배정된 날은 지각/조기퇴실 자동 벌점을 부과하지 않는다.
-- default true 라 기존 15개 타입은 전부 의무등원으로 남는다(무회귀).
--
-- 주의: 이 타입에는 weekly_goal_settings 를 만들지 않는다. computeWeeklyGoal
-- (src/lib/study/weekly-goal.ts) 이 설정 없는 날을 assignedDays 에서 제외하고
-- scale = 7/assignedDays 로 보정하므로, 설정을 두지 않아야 주간 목표가 불변한다.

alter table date_type_definitions
  add column if not exists is_mandatory boolean not null default true;

comment on column date_type_definitions.is_mandatory is
  '의무등원 여부. false = 자율등원(주말/공휴일) — 지각·조기퇴실 자동 벌점을 부과하지 않는다.';
