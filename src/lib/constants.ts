// 사용자 타입
export const USER_TYPES = {
  STUDENT: 'student',
  PARENT: 'parent',
  ADMIN: 'admin',
} as const;

export type UserType = typeof USER_TYPES[keyof typeof USER_TYPES];

// 입실/퇴실 타입
export const ATTENDANCE_TYPES = {
  CHECK_IN: 'check_in',
  CHECK_OUT: 'check_out',
  BREAK_START: 'break_start',
  BREAK_END: 'break_end',
} as const;

export type AttendanceType = typeof ATTENDANCE_TYPES[keyof typeof ATTENDANCE_TYPES];

// 상벌점 타입
export const POINT_TYPES = {
  REWARD: 'reward',
  PENALTY: 'penalty',
} as const;

export type PointType = typeof POINT_TYPES[keyof typeof POINT_TYPES];

// 스케줄 상태
export const SCHEDULE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ScheduleStatus = typeof SCHEDULE_STATUS[keyof typeof SCHEDULE_STATUS];

// 알림 타입
export const NOTIFICATION_TYPES = {
  LATE: 'late',
  ABSENT: 'absent',
  POINT: 'point',
  SCHEDULE: 'schedule',
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

// 몰입도 빠른 입력 프리셋
export const FOCUS_PRESETS = [
  { label: '완전몰입', score: 10 },
  { label: '인강', score: 8 },
  { label: '졸음', score: 5 },
  { label: '집중저하', score: 3 },
] as const;

// 기본 과목 목록
export const DEFAULT_SUBJECTS = [
  '국어',
  '수학',
  '영어',
  '과학',
  '사회',
  '기타',
] as const;

// 색상 (CSS 변수와 동일)
export const COLORS = {
  primary: '#7C9FF5',
  secondary: '#F5A7B8',
  accent: '#A7D7A7',
  background: '#FAFBFC',
  card: '#FFFFFF',
  text: '#374151',
  textMuted: '#9CA3AF',
  success: '#86EFAC',
  warning: '#FDE68A',
  error: '#FCA5A5',
} as const;

// 학습일 시간 설정
// 하루 시작: 07:30, 하루 종료: 다음날 01:30
// 새벽 01:30 이전은 전날의 학습일로 계산
export const DAY_CONFIG = {
  startHour: 7,
  startMinute: 30,
  endHour: 25,  // 다음날 01:30 = 25:30으로 표현
  endMinute: 30,
  weekStartsOn: 0,  // 일요일
} as const;

// 날짜 타입
export const DATE_TYPES = {
  SEMESTER: 'semester',  // 학기중
  VACATION: 'vacation',  // 방학
  SPECIAL: 'special',    // 특수상황
} as const;

export type DateType = typeof DATE_TYPES[keyof typeof DATE_TYPES];

// 부재 스케줄 관련 상수
export const ABSENCE_BUFFER_MINUTES = 60; // 부재 스케줄 앞뒤 버퍼 시간 (분)

// 부재 스케줄 반복 타입
export const RECURRENCE_TYPES = {
  WEEKLY: 'weekly',
  ONE_TIME: 'one_time',
} as const;

export type RecurrenceType = typeof RECURRENCE_TYPES[keyof typeof RECURRENCE_TYPES];

// 부재 스케줄 적용 날짜 타입
export const SCHEDULE_DATE_TYPES = {
  SEMESTER: 'semester',  // 학기중에만
  VACATION: 'vacation',  // 방학에만
  ALL: 'all',            // 항상
} as const;

export type ScheduleDateType = typeof SCHEDULE_DATE_TYPES[keyof typeof SCHEDULE_DATE_TYPES];

// 요일 이름
export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

// 출결 관련 설정
export const ATTENDANCE_CONFIG = {
  gracePeriodMinutes: 15, // 외출 허용 시간 (분) - 이 시간 초과 시 퇴실-재입실 처리
} as const;

// 자동 벌점 규칙
export const PENALTY_RULES = {
  lateCheckIn: { amount: 1, reason: '지각' },
  earlyCheckOut: { amount: 1, reason: '조기퇴실' },
} as const;
