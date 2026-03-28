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

// 몰입도 빠른 입력 프리셋 (퀵버튼)
export const FOCUS_PRESETS = [
  { label: '인강', score: 8, activityLabel: '인강 수강 중' },
  { label: '수면', score: 5, activityLabel: '수면 중' },
  { label: '라운지', score: 7, activityLabel: '라운지 이용 중' },
  { label: '클리닉/멘토링', score: 10, activityLabel: '클리닉/멘토링 중' },
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
// 하루 시작: 06:00, 하루 종료: 다음날 03:00
// 새벽 03:00 이전은 전날의 학습일로 계산
// 03:00~06:00 = 일일 리셋 구간 (3시간 갭)
export const DAY_CONFIG = {
  startHour: 6,
  startMinute: 0,
  endHour: 27,  // 다음날 03:00 = 27:00으로 표현
  endMinute: 0,
  weekStartsOn: 1,  // 월요일
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

// 부재 사유
export const ABSENCE_REASONS = [
  { value: 'academy', label: '학원 또는 과외 참석' },
  { value: 'school_program', label: '학교 프로그램 참석' },
  { value: 'hospital', label: '병원 방문 (건강검진 또는 치료)' },
  { value: 'family', label: '가족 모임 (생일, 결혼식, 제사 등)' },
  { value: 'other', label: '기타 사유' },
] as const;

export type AbsenceReasonValue = typeof ABSENCE_REASONS[number]['value'];

// 리포트 과목 대분류 매핑
// key = 대분류명, value = 해당 대분류에 속하는 과목명 배열 (소문자 비교)
export const SUBJECT_CATEGORIES: Record<string, string[]> = {
  '국어': ['국어', '국문학', '문학', '독서', '화법과작문', '언어와매체'],
  '수학': ['수학', '수학1', '수학2', '미적분', '확률과통계', '기하', '수학(상)', '수학(하)'],
  '영어': ['영어', '영어1', '영어2', '영문학'],
  '탐구': ['과학', '사회', '물리', '물리학', '화학', '생물', '생명과학', '지구과학',
           '한국사', '세계사', '동아시아사', '지리', '한국지리', '세계지리',
           '윤리', '생활과윤리', '윤리와사상', '경제', '정치와법', '사회문화'],
  '기타': ['기타'],
} as const;

// 대분류 표시 순서
export const SUBJECT_CATEGORY_ORDER = ['국어', '수학', '영어', '탐구', '기타', '미분류'] as const;
export type SubjectCategory = typeof SUBJECT_CATEGORY_ORDER[number];

// 리포트 과목 대분류별 색상 (이미지 참조: 파랑/주황/녹색/노랑/회색/연회색)
export const REPORT_SUBJECT_COLORS: Record<string, string> = {
  '국어': '#5B8DEF',
  '수학': '#F5A623',
  '영어': '#7ED321',
  '탐구': '#F8D44D',
  '기타': '#9CA3AF',
  '미분류': '#D1D5DB',
};

// 과목명 → 대분류 변환 함수
export function getSubjectCategory(subjectName: string): SubjectCategory {
  const normalized = subjectName.trim();
  for (const [category, subjects] of Object.entries(SUBJECT_CATEGORIES)) {
    if (subjects.some(s => s === normalized || normalized.includes(s))) {
      return category as SubjectCategory;
    }
  }
  return '기타';
}

// 상담 리포트 자동 생성 템플릿 (몰입도 평균 구간별)
export const COUNSELING_TEMPLATES = {
  getStudyFeedback(focusAvg: number | null): string {
    if (focusAvg === null) return '해당 주간 몰입도 측정 기록이 없습니다.';
    if (focusAvg >= 90) return '매우 높은 집중력으로 성실하게 학습에 임하고 있습니다.';
    if (focusAvg >= 80) return '전반적으로 성실하게 학습에 임하고 있으며, 안정적인 학습 태도를 보이고 있습니다.';
    if (focusAvg >= 70) return '학습 태도가 양호하나, 간헐적으로 집중력이 흐트러지는 모습이 관찰됩니다.';
    if (focusAvg >= 60) return '집중력 유지에 어려움이 있으며, 학습 환경 개선이 필요합니다.';
    return '학습 집중도가 낮아 개선이 시급합니다. 면담을 통한 학습 동기 부여가 필요합니다.';
  },
  getGuidanceNotes(focusAvg: number | null): string {
    if (focusAvg === null) return '';
    if (focusAvg >= 80) return '현재 학습 패턴을 유지하면서 심화 학습에 도전해보세요.';
    if (focusAvg >= 60) return '집중이 흐트러질 때 짧은 휴식 후 다시 집중하는 연습이 도움이 됩니다.';
    return '학습 계획을 재정비하고, 단계적으로 집중 시간을 늘려가는 것을 권장합니다.';
  },
  getParentSummary(studentName: string, focusAvg: number | null, studyHoursWeekly: number): string {
    const focusText = focusAvg !== null ? `평균 ${focusAvg}점` : '미측정';
    const hoursText = `주간 ${Math.floor(studyHoursWeekly)}시간 ${Math.round((studyHoursWeekly % 1) * 60)}분`;
    return `${studentName} 학생은 몰입도 ${focusText}, 순공시간 ${hoursText}의 학습량을 보이고 있습니다.\n${
      focusAvg !== null && focusAvg >= 70
        ? '어머님의 관심에 감사드리며, 지속적으로 지도하겠습니다.'
        : '학생의 학습 태도 개선을 위해 지속적으로 지도하겠습니다.'
    }`;
  },
};
