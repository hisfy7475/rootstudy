# 개발 진행 상황

## 현재 상태

| 항목 | 내용 |
|------|------|
| 현재 Phase | Phase 10 완료 |
| 진행 중인 작업 | Phase 11: 외부 연동 및 배포 |
| 마지막 업데이트 | 2026-01-28 |

---

## 0127 미팅 반영사항 요약

> `manager/client/0127_미팅_개발반영사항.md` 기반으로 Phase 7~10 신규 추가

### 우선순위별 반영 항목
| 순위 | 기능 | Phase | 중요도 |
|------|------|-------|--------|
| 1 | 하루 시간 기준 (07:30~01:30) | 7 | 필수 |
| 2 | 날짜 타입 시스템 (학기/방학) | 7 | 필수 |
| 3 | 지점(브랜치) 관리 | 7 | 필수 |
| 4 | 학생 부재 스케줄 등록 | 8 | 필수 |
| 5 | 출결 관리 고도화 (15분 외출) | 9 | 필수 |
| 6 | 주간 목표 시간 (타입별) | 8,9 | 중요 |
| 7 | 교시제 기능 | 9 | 중요 |
| 8 | 학생 타입별 과목 설정 | 8 | 추가 |
| 9 | 알림 채널 분리 (카톡/웹푸시) | 10 | 추가 |

### 클라이언트 확인 필요 항목
- [ ] 출결 관련 벌점 및 알림 정책 구체화
- [ ] 지점 리스트
- [ ] 학생 정보 필수 입력 필드
- [ ] 학생 타입 리스트 (고3, 재수생, 고1 이하 등)
- [ ] 세부 정책 (외출 허용 시간 등)

---

## Phase 11: 외부 연동 및 배포 (진행 예정)

### 작업 항목
- [ ] CAPS API 연동 인터페이스 준비
- [ ] 카카오 알림톡 연동
- [ ] 배포 완료
- [ ] 도메인 및 SSL 설정

### 다음 작업
개발 완료 후 운영

---

## 완료된 Phase 요약

### Phase 10: 알림 시스템 고도화 (완료)
- student_notifications, push_subscriptions 테이블 생성 (RLS 정책 포함)
- Service Worker (sw.js) 및 manifest.json 생성 (PWA 지원)
- 알림 관련 서버 액션 (notification.ts) 구현
  - 학생 알림 목록 조회, 읽음 처리, 전체 읽음
  - 푸시 구독 저장/삭제/비활성화
  - 통합 알림 발송 (sendNotificationToAll - 채널 자동 분기)
- 학생용 알림 센터 페이지 (student/notifications)
  - 알림 목록 (오늘/이번주/이전 그룹화)
  - 푸시 알림 토글 기능
  - 읽지 않은 알림 뱃지
- 학생 헤더에 알림 아이콘 추가 (읽지 않은 알림 수 표시)
- 기존 기능에 알림 연동
  - 자동 벌점 부여 시 알림 (student.ts)
  - 수동 상벌점 부여 시 알림 (admin.ts)
  - 채팅 메시지 수신 시 알림 (chat.ts)

### Phase 9: 출결 및 목표 시스템 고도화 (완료)
- 15분 외출 로직 구현 (endBreak 함수 수정, ATTENDANCE_CONFIG 상수)
- 학부모 뷰 퇴실 표시 로직 (getStudentStatus에 forParentView 옵션)
- 의무 시간 조회 함수 (getMandatoryTime) 구현
- 자동 벌점 시스템 (checkIn/checkOut에 지각/조기퇴실 체크 및 벌점 부여)
- period_definitions 테이블 생성 및 RLS 정책
- 교시 관리 Actions (period.ts) 및 관리자 페이지 (admin/periods)
- 주간 학습 시간/목표 달성도 계산 (getWeeklyStudyTime, getWeeklyProgress)
- 학생 대시보드에 주간 학습 목표 달성도 UI 추가 (WeeklyStudyProgress 컴포넌트)

### Phase 8: 학생 타입 및 스케줄 시스템 (완료)
- student_types, student_type_subjects, student_absence_schedules 테이블 생성
- 학생 타입 관리자 설정 페이지 (admin/student-types)
- 타입별 선택 가능 과목 설정 기능
- 학생 부재 스케줄 등록 페이지 (student/schedule)
- 부재 스케줄 앞뒤 1시간 버퍼 적용 (알림/벌점 면제)
- 학부모/관리자 부재 스케줄 확인 페이지
- 학생 과목 선택 페이지 타입별 필터링

### Phase 7: 핵심 인프라 확장 (완료)
- DAY_CONFIG 상수 및 시간 유틸리티 함수 구현 (07:30~다음날 01:30)
- branches 테이블 생성, profiles에 branch_id 연결
- date_type_definitions, date_assignments 테이블 생성
- 관리자 지점 관리 페이지 (admin/branches)
- 관리자 날짜 타입 관리 페이지 (admin/date-types)
- 학생 회원가입 폼 수정 (생일, 지점 필드 추가)
- 기존 시간 계산 로직 DAY_CONFIG 기준으로 업데이트
- 사이드바에 지점 관리, 날짜 타입 메뉴 추가

### Phase 1: 프로젝트 기초 설정 (완료)
- 패키지 설치 완료 (@supabase/supabase-js, @supabase/ssr, lucide-react, date-fns, xlsx, clsx, tailwind-merge)
- 프로젝트 구조 생성 완료 (app 라우트, components, lib, hooks, types)
- Supabase 클라이언트 설정 완료 (client.ts, server.ts)
- 환경변수 템플릿 생성 (.env.local.example)
- 공통 UI 컴포넌트 생성 완료 (Button, Card, Input)
- 레이아웃 컴포넌트 생성 완료 (BottomNav, Sidebar)
- Pretendard 폰트 설정 완료 (CDN)
- 전역 스타일 설정 완료 (색상 팔레트)

### Phase 2: 인증 시스템 (완료)
- 데이터베이스 테이블 생성 (profiles, student_profiles, parent_profiles)
- RLS(Row Level Security) 정책 설정 완료
- Server Actions 구현 (signUp, signIn, signOut, resetPassword, verifyParentCode)
- 로그인 페이지 구현 (이메일/비밀번호 입력, 로그인 처리)
- 학생 회원가입 구현 (폼 + 학부모 연결 코드 자동 생성/표시)
- 학부모 회원가입 구현 (폼 + 연결 코드 검증으로 학생 연결)
- 비밀번호 찾기 구현 (이메일로 재설정 링크 발송)
- 미들웨어 업데이트 (사용자 타입별 자동 리다이렉트)

### Phase 3: 학생 웹 (완료)
- 메인 대시보드 (타이머 뷰)
- 등원 목표 설정 페이지
- 과목 설정 페이지
- 몰입도 확인 페이지
- 상벌점 내역 페이지
- 학생 레이아웃 및 네비게이션
- DB 테이블: attendance, study_goals, subjects, focus_scores, points

### Phase 4: 학부모 웹 (완료)
- 메인 대시보드 (학생 상태 확인)
- 스케줄 승인 페이지
- 학부모 레이아웃 및 네비게이션
- DB 테이블: schedules

### Phase 5: 관리자 웹 (완료)
- 학생 현황 대시보드 (실시간 상태, 과목 직접 입력)
- 몰입도 관리 (빠른 점수 입력, 주간 리포트)
- 상벌점 관리 (부여, 현황, 내역)
- 회원 관리 (학생/학부모, 상세 정보, 통계)
- 알림 관리 (내역 조회, 카카오 연동 예정)
- 데이터 다운로드 (엑셀 내보내기)

### Phase 6: 3자 채팅 시스템 (완료)
- 학생당 1개의 3자 채팅방 (학생-학부모-관리자)
- Supabase Realtime으로 실시간 메시지 전송/수신
- 사용자별 읽음 표시 기능
- 관리자 채팅방 목록 (읽지 않은 메시지 수 표시)
- DB 테이블: chat_rooms, chat_messages

---

## AI 개발 지침

### 개발 시작 시

1. **이 파일(progress.md)을 먼저 읽기**
2. **roadmap.md 읽기** - 전체 개발 계획 및 기술 스택 확인
3. **현재 상태 확인** - 어느 Phase의 어떤 작업까지 완료됐는지 파악
4. **다음 작업부터 이어서 개발**

### Supabase MCP 사용

이 프로젝트는 **Supabase MCP**가 설정되어 있어 AI가 직접 데이터베이스 작업을 수행할 수 있습니다.

**가능한 작업:**
- 테이블 생성/수정/삭제 (마이그레이션)
- RLS(Row Level Security) 정책 설정
- 데이터 조회/삽입/수정/삭제
- SQL 쿼리 직접 실행
- 스키마 확인 및 관리

**사용 방법:**
- MCP 도구를 통해 Supabase에 직접 연결
- roadmap.md의 데이터베이스 스키마 참고하여 테이블 생성
- 별도의 마이그레이션 파일 없이 AI가 직접 DB 작업 수행

### 개발 중

- 각 작업 완료 시 체크박스 표시 `[x]`
- 파일 생성/수정 시 관련 경로 기록 가능
- 에러나 이슈 발생 시 메모 남기기

### 개발 완료 후

1. **완료된 항목 체크** `[x]`
2. **현재 상태 테이블 업데이트**
   - 현재 Phase
   - 진행 중인 작업
   - 마지막 업데이트 날짜
3. **Phase 완료 시**
   - 해당 Phase 섹션을 "완료된 Phase 요약"으로 이동
   - 상세 내용 삭제하고 간단히 요약만 유지 (컨텍스트 절약)

---

## 주요 파일 경로 참고

```
src/
├── app/
│   ├── (auth)/
│   │   ├── actions.ts              # 인증 관련 Server Actions
│   │   ├── login/page.tsx
│   │   ├── signup/student/page.tsx
│   │   ├── signup/parent/page.tsx
│   │   └── forgot-password/page.tsx
│   ├── student/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── notifications/              # Phase 10 추가
│   │   │   ├── page.tsx
│   │   │   └── notifications-client.tsx
│   │   └── chat/
│   │       ├── page.tsx
│   │       └── chat-client.tsx
│   ├── parent/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── schedule/
│   │   │   └── page.tsx
│   │   └── chat/
│   │       ├── page.tsx
│   │       └── chat-client.tsx
│   ├── admin/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── dashboard-client.tsx
│   │   ├── focus/
│   │   │   ├── page.tsx
│   │   │   └── focus-client.tsx
│   │   ├── points/
│   │   │   ├── page.tsx
│   │   │   └── points-client.tsx
│   │   ├── members/
│   │   │   ├── page.tsx
│   │   │   └── members-client.tsx
│   │   ├── notifications/
│   │   │   ├── page.tsx
│   │   │   └── notifications-client.tsx
│   │   ├── download/
│   │   │   └── page.tsx
│   │   ├── periods/                  # Phase 9 추가
│   │   │   ├── page.tsx
│   │   │   └── periods-client.tsx
│   │   └── chat/
│   │       ├── page.tsx
│   │       └── chat-client.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   └── input.tsx
│   ├── student/
│   │   ├── weekly-study-progress.tsx # Phase 9 추가 (주간 학습 목표 달성도)
│   │   └── ...
│   ├── parent/
│   │   ├── header.tsx
│   │   ├── student-info-card.tsx
│   │   ├── student-status-card.tsx
│   │   └── schedule-list.tsx
│   ├── admin/
│   │   ├── student-table.tsx
│   │   └── dashboard-stats.tsx
│   └── shared/
│       ├── bottom-nav.tsx
│       ├── sidebar.tsx
│       └── chat/
│           ├── index.ts
│           ├── chat-room.tsx
│           ├── chat-message-list.tsx
│           ├── chat-message-item.tsx
│           └── chat-input.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── actions/
│   │   ├── student.ts              # 15분 외출, 자동 벌점, 주간 달성도 추가
│   │   ├── parent.ts               # forParentView 옵션 추가
│   │   ├── admin.ts
│   │   ├── chat.ts                 # 채팅 알림 연동 추가
│   │   ├── date-type.ts            # getMandatoryTime 추가
│   │   ├── notification.ts         # Phase 10 추가 (알림 시스템)
│   │   └── period.ts               # Phase 9 추가 (교시 관리)
│   ├── utils.ts
│   └── constants.ts                # ATTENDANCE_CONFIG, PENALTY_RULES 추가
├── hooks/
│   └── use-chat.ts
├── types/
│   └── database.ts
└── middleware.ts
```

---

## 메모

- Next.js 16에서 라우트 그룹으로 동일 경로 페이지 생성 불가 → /student, /parent, /admin 경로로 분리

---

## 환경 설정 체크리스트

- [x] Supabase 프로젝트 생성됨
- [x] Supabase MCP 연결됨 (AI가 직접 DB 작업 가능)
- [x] 환경변수 설정됨 (.env.local)
- [x] 데이터베이스 테이블 생성됨 (profiles, student_profiles, parent_profiles + RLS)
- [x] RLS(Row Level Security) 정책 설정됨
