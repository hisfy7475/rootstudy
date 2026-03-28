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

/** 몰입도 점수별 학부모 안내 템플릿 (기본값, DB 미설정 시 사용) — .00_manager/client/0326 학부모 관련.txt */
export interface FocusScoreTemplate {
  label: string;
  short: string;
  full: string;
}

export const FOCUS_SCORE_TEMPLATES: Record<number, FocusScoreTemplate> = {
  10: {
    label: '최상 몰입 단계',
    short: '학습 시간 전반에 걸쳐 외부 자극에 흔들림 없이 높은 집중력을 유지하였으며, 계획된 학습 과제를 스스로 점검하고 완성도 높게 수행하였습니다.\n학습 태도, 지속력, 자기조절 능력이 모두 우수하여 자기주도 학습 역량이 안정적으로 자리 잡은 상태입니다.',
    full: '학습 시간 전반에 걸쳐 외부 자극이나 환경 변화에 흔들림 없이 높은 집중력을 지속적으로 유지하였습니다.\n계획된 학습 과제를 스스로 점검하며 우선순위를 정해 효율적으로 수행하였고, 학습 과정 중 이해가 부족한 부분은 반복 학습을 통해 보완하는 자기조절 능력도 우수하게 나타났습니다.\n학습 태도의 성실성, 집중 지속력, 자기주도 문제 해결력이 모두 안정적인 수준에 도달한 상태로, 현재의 학습 흐름을 유지할 경우 성취도 향상이 기대되는 매우 이상적인 몰입 단계입니다.',
  },
  9: {
    label: '우수 몰입 단계',
    short: '수업 및 자율학습 시간 동안 집중력이 안정적으로 유지되었으며, 계획된 학습을 성실하게 이행하였습니다.\n학습 흐름이 끊기지 않고 꾸준히 이어지는 모습으로, 자기주도 학습 습관이 잘 형성되어 있는 우수한 상태입니다.',
    full: '수업 및 자율학습 시간 동안 전반적으로 집중력이 안정적으로 유지되었으며, 학습 계획에 맞추어 과제를 충실히 이행하는 모습을 보였습니다.\n학습 중간에 흐름이 일부 완만해지는 구간은 있었으나, 스스로 학습 페이스를 조절하며 다시 집중 상태를 회복하는 자기관리 능력이 확인되었습니다.\n전반적인 학습 지속력과 참여 태도가 우수하여 자기주도 학습 습관이 점차 안정적으로 형성되고 있는 긍정적인 상태입니다.',
  },
  8: {
    label: '안정적 학습 단계',
    short: '주어진 학습 과정에 성실히 참여하며 전반적인 학습 흐름을 안정적으로 유지하였습니다.\n집중력과 학습 지속력이 일정 수준 유지되고 있으며, 규칙적인 학습 리듬이 점차 자리 잡아가고 있는 단계입니다.',
    full: '주어진 학습 과정에 성실히 참여하며 정해진 학습 시간을 안정적으로 유지하였습니다.\n학습 중 큰 집중 저하 없이 일정한 학습 흐름을 이어갔으며, 과제 수행 또한 무리 없이 진행되었습니다.\n다만, 학습 밀도나 집중 지속 시간 측면에서는 다소 기복이 있어 최상위 몰입 단계로 도약하기 위한 관리가 병행되고 있습니다.\n규칙적인 학습 리듬이 형성되는 과정에 있으며, 현재의 학습 습관이 안정적으로 자리 잡을 수 있도록 지도하고 있습니다.',
  },
  7: {
    label: '집중 관리 단계',
    short: '학습 중 주변 환경이나 피로 등의 영향으로 집중력이 일시적으로 저하되는 모습이 있었으나, 지도 후 점차 학습 흐름을 회복하였습니다.\n장시간 집중 유지에는 다소 보완이 필요하여 학습 밀도 향상을 위한 지속적인 관리가 이루어지고 있습니다.',
    full: '학습 중 주변 환경 요인이나 일시적인 피로 영향으로 인해 집중력이 간헐적으로 저하되는 모습이 관찰되었습니다.\n특정 시간대에는 학습 몰입이 느슨해지는 경향이 있었으나, 지도 후 다시 학습 흐름을 회복하며 과제를 이어가는 모습을 보였습니다.\n장시간 집중 유지 능력과 학습 밀도 향상을 위한 추가 관리가 필요한 단계이며, 학습 시간 분할 운영 및 집중력 환기 지도를 병행하고 있습니다.',
  },
  6: {
    label: '컨디션 관리 단계',
    short: '컨디션 난조 및 피로 누적으로 인해 집중 지속 시간이 짧아지며 학습 몰입이 제한되는 모습이 관찰되었습니다.\n충분한 휴식과 생활 리듬 조정이 필요하며, 컨디션 회복 이후 학습 집중도가 정상화될 수 있도록 지도하고 있습니다.',
    full: '컨디션 난조와 피로 누적으로 인해 집중 지속 시간이 전반적으로 짧아지며 학습 몰입이 제한되는 모습이 확인되었습니다.\n학습 중 졸음이나 주의 분산으로 인해 학습 흐름이 여러 차례 끊어지는 경향이 있었으며, 이에 따라 계획된 학습 진도가 일부 조정되었습니다.\n충분한 휴식과 수면 시간 확보, 생활 리듬 안정이 우선적으로 필요한 상태이며, 컨디션 회복 이후 학습 집중도가 정상화될 수 있도록 학습 강도 조절과 병행 지도를 진행하고 있습니다.',
  },
};

export const COUNSELING_TEMPLATES = {
  getScoreTemplate(focusAvg: number | null): FocusScoreTemplate | null {
    if (focusAvg === null) return null;
    const score = Math.min(10, Math.max(6, Math.round(focusAvg)));
    return FOCUS_SCORE_TEMPLATES[score] ?? FOCUS_SCORE_TEMPLATES[6];
  },

  getStudyFeedback(focusAvg: number | null): string {
    if (focusAvg === null) return '해당 주간 몰입도 측정 기록이 없습니다.';
    const tpl = COUNSELING_TEMPLATES.getScoreTemplate(focusAvg);
    return tpl ? tpl.short : '해당 주간 몰입도 측정 기록이 없습니다.';
  },

  getStudyFeedbackFull(focusAvg: number | null): string {
    if (focusAvg === null) return '해당 주간 몰입도 측정 기록이 없습니다.';
    const tpl = COUNSELING_TEMPLATES.getScoreTemplate(focusAvg);
    return tpl ? tpl.full : '해당 주간 몰입도 측정 기록이 없습니다.';
  },

  getScoreLabel(focusAvg: number | null): string {
    const tpl = COUNSELING_TEMPLATES.getScoreTemplate(focusAvg);
    return tpl ? tpl.label : '';
  },

  getGuidanceNotes(focusAvg: number | null): string {
    if (focusAvg === null) return '';
    if (focusAvg >= 9) return '현재의 학습 흐름을 유지하면서 심화 학습에 도전해보는 것을 권장합니다.';
    if (focusAvg >= 8) return '최상위 몰입 단계로의 도약을 위해 학습 밀도를 높이는 관리를 병행하고 있습니다.';
    if (focusAvg >= 7) return '학습 시간 분할 운영 및 집중력 환기 지도를 병행하고 있습니다.';
    return '충분한 휴식과 생활 리듬 안정을 우선으로, 학습 강도 조절과 병행 지도를 진행하고 있습니다.';
  },

  /** DB/커스텀 short 문단이 적용된 요약 */
  buildParentSummaryWithFeedback(
    studentName: string,
    focusAvg: number | null,
    studyHoursWeekly: number,
    scoreLabel: string,
    studyFeedbackShort: string
  ): string {
    const focusText =
      focusAvg !== null ? `평균 ${Math.round(focusAvg * 10) / 10}점` : '미측정';
    const h = Math.floor(studyHoursWeekly);
    const m = Math.round((studyHoursWeekly % 1) * 60);
    const hoursText = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    const labelText = scoreLabel ? ` (${scoreLabel})` : '';
    return `${studentName} 학생은 몰입도 ${focusText}${labelText}, 주간 순공시간 ${hoursText}의 학습량을 보이고 있습니다.\n${studyFeedbackShort}`;
  },

  getParentSummary(studentName: string, focusAvg: number | null, studyHoursWeekly: number): string {
    const label = COUNSELING_TEMPLATES.getScoreLabel(focusAvg);
    return COUNSELING_TEMPLATES.buildParentSummaryWithFeedback(
      studentName,
      focusAvg,
      studyHoursWeekly,
      label,
      COUNSELING_TEMPLATES.getStudyFeedback(focusAvg)
    );
  },
};
