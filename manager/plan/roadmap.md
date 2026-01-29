# 독서실 학습관리 시스템 - 개발 로드맵

## 프로젝트 개요

독서실 학생들의 실시간 학습시간 관리, 몰입도 측정, 등원 목표 관리 및 학부모-관리자 간 소통 시스템

### 사용자 유형
- **학생**: 모바일/태블릿 최적화
- **학부모**: 모바일/태블릿 최적화
- **관리자**: PC 화면 최적화

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Backend/DB | Supabase (Auth, Database, Realtime) |
| 아이콘 | Lucide React |
| UI 컴포넌트 | shadcn/ui 기반 커스텀 |
| 폰트 | Pretendard |

### 추가 패키지
```
@supabase/supabase-js
@supabase/ssr
lucide-react
date-fns
xlsx (엑셀 다운로드)
```

---

## UI/UX 가이드라인

### 디자인 컨셉
- **스타일**: 귀엽고 부드러운 느낌 (파스텔톤, 둥근 모서리)
- **아이콘**: Lucide React (outline 스타일)
- **폰트**: Pretendard (둥근 고딕)

### 반응형 브레이크포인트
```css
/* 모바일 */
@media (max-width: 640px) { }

/* 태블릿 */
@media (min-width: 641px) and (max-width: 1024px) { }

/* PC */
@media (min-width: 1025px) { }
```

### 색상 팔레트
```
Primary: #7C9FF5 (부드러운 파랑)
Secondary: #F5A7B8 (부드러운 핑크)
Accent: #A7D7A7 (부드러운 민트)
Background: #FAFBFC
Card: #FFFFFF
Text: #374151
Text Muted: #9CA3AF
Success: #86EFAC
Warning: #FDE68A
Error: #FCA5A5
```

### 컴포넌트 스타일
- 버튼: `rounded-2xl`, 부드러운 그림자
- 카드: `rounded-3xl`, `shadow-sm`
- 입력창: `rounded-xl`, 큰 패딩
- 탭/네비게이션: 아이콘 + 텍스트 조합

---

## 프로젝트 구조

```
src/
├── app/
│   ├── (auth)/                    # 인증 관련 (로그인, 회원가입, 비밀번호 찾기)
│   │   ├── login/
│   │   ├── signup/
│   │   │   ├── student/
│   │   │   └── parent/
│   │   └── forgot-password/
│   │
│   ├── (student)/                 # 학생 전용 페이지
│   │   ├── layout.tsx
│   │   ├── page.tsx               # 메인 대시보드 (학습시간 타이머)
│   │   ├── goal/                  # 등원 목표 설정
│   │   ├── subject/               # 과목 설정
│   │   ├── focus/                 # 몰입도 확인
│   │   ├── points/                # 상벌점 내역
│   │   └── chat/                  # 3자 채팅
│   │
│   ├── (parent)/                  # 학부모 전용 페이지
│   │   ├── layout.tsx
│   │   ├── page.tsx               # 학생 상태 확인
│   │   ├── schedule/              # 스케줄 승인
│   │   └── chat/                  # 3자 채팅
│   │
│   ├── (admin)/                   # 관리자 전용 페이지
│   │   ├── layout.tsx
│   │   ├── page.tsx               # 학생 현황 대시보드
│   │   ├── focus/                 # 몰입도 관리
│   │   ├── points/                # 상벌점 관리
│   │   ├── members/               # 회원 관리
│   │   ├── notifications/         # 알림 관리
│   │   ├── download/              # 데이터 다운로드
│   │   └── chat/                  # 채팅 관리
│   │
│   ├── layout.tsx
│   ├── page.tsx                   # 루트 (로그인 여부에 따라 리다이렉트)
│   └── globals.css
│
├── components/
│   ├── ui/                        # 공통 UI 컴포넌트
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── tabs.tsx
│   │   └── ...
│   ├── student/                   # 학생 전용 컴포넌트
│   ├── parent/                    # 학부모 전용 컴포넌트
│   ├── admin/                     # 관리자 전용 컴포넌트
│   └── shared/                    # 공통 컴포넌트
│       ├── timer-display.tsx      # 학습시간 타이머 표시
│       ├── bottom-nav.tsx         # 하단 네비게이션 (모바일)
│       ├── sidebar.tsx            # 사이드바 (PC)
│       └── chat/                  # 채팅 컴포넌트
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # 브라우저 클라이언트
│   │   ├── server.ts              # 서버 클라이언트
│   │   └── middleware.ts          # 인증 미들웨어
│   ├── utils.ts                   # 유틸리티 함수
│   └── constants.ts               # 상수 정의
│
├── hooks/
│   ├── use-user.ts                # 사용자 정보 훅
│   ├── use-attendance.ts          # 입실/퇴실 상태 훅
│   └── use-realtime.ts            # 실시간 데이터 훅
│
├── types/
│   └── database.ts                # Supabase 타입 정의
│
└── middleware.ts                  # Next.js 미들웨어 (인증 체크)
```

---

## 데이터베이스 스키마

### users (Supabase Auth 확장)
```sql
-- Supabase Auth의 auth.users 테이블 사용
-- 추가 정보는 profiles 테이블에 저장
```

### profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  user_type TEXT NOT NULL CHECK (user_type IN ('student', 'parent', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### student_profiles
```sql
CREATE TABLE student_profiles (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  seat_number INTEGER,
  parent_code TEXT UNIQUE NOT NULL,  -- 학부모 연결 코드
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### parent_profiles
```sql
CREATE TABLE parent_profiles (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### parent_student_links (학부모-학생 연결, 1:N 지원)
```sql
CREATE TABLE parent_student_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_id, student_id)
);
```

### attendance (입실/퇴실 기록)
```sql
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('check_in', 'check_out', 'break_start', 'break_end')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'manual' CHECK (source IN ('caps', 'manual'))  -- CAPS 연동 or 수동
);
```

### study_goals (등원 목표)
```sql
CREATE TABLE study_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
  target_time TIME NOT NULL,  -- 등원 목표 시간
  date DATE NOT NULL,
  achieved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, date)
);
```

### subjects (학습 과목)
```sql
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_current BOOLEAN DEFAULT TRUE
);
```

### focus_scores (몰입도 점수)
```sql
CREATE TABLE focus_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES profiles(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  note TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
```

### points (상벌점)
```sql
CREATE TABLE points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('reward', 'penalty')),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  is_auto BOOLEAN DEFAULT FALSE,  -- 자동 부여 여부
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### schedules (스케줄 - 학부모 승인용)
```sql
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### chat_rooms (채팅방)
```sql
CREATE TABLE chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### chat_messages (채팅 메시지)
```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id),
  content TEXT NOT NULL,
  is_read_by_student BOOLEAN DEFAULT FALSE,
  is_read_by_parent BOOLEAN DEFAULT FALSE,
  is_read_by_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### notifications (알림 기록)
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES parent_profiles(id),
  student_id UUID REFERENCES student_profiles(id),
  type TEXT NOT NULL CHECK (type IN ('late', 'absent', 'point', 'schedule')),
  message TEXT NOT NULL,
  sent_via TEXT DEFAULT 'kakao' CHECK (sent_via IN ('kakao', 'push')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  is_sent BOOLEAN DEFAULT FALSE
);
```

---

## 개발 단계

### Phase 1: 프로젝트 기초 설정

#### 1.1 패키지 설치
```bash
npm install @supabase/supabase-js @supabase/ssr lucide-react date-fns xlsx
npm install -D @types/node
```

#### 1.2 프로젝트 구조 생성
- `src/app` 라우트 그룹 생성: `(auth)`, `(student)`, `(parent)`, `(admin)`
- `src/components/ui` 공통 컴포넌트
- `src/lib/supabase` Supabase 클라이언트 설정
- `src/types` 타입 정의

#### 1.3 Supabase 설정
- 환경변수 설정 (`.env.local`)
- Supabase 클라이언트 생성 (브라우저/서버)
- 미들웨어 설정

#### 1.4 공통 레이아웃 및 컴포넌트
- 폰트 설정 (Pretendard)
- 전역 스타일 (globals.css)
- 공통 UI 컴포넌트 (Button, Card, Input, Tabs)
- 하단 네비게이션 (모바일용)
- 사이드바 (PC용, 관리자)

#### 완료 기준
- [ ] 패키지 설치 완료
- [ ] 프로젝트 폴더 구조 생성
- [ ] Supabase 클라이언트 설정
- [ ] 공통 UI 컴포넌트 생성
- [ ] 레이아웃 컴포넌트 생성

---

### Phase 2: 인증 시스템

#### 2.1 로그인 페이지 (`/login`)
- 이메일/비밀번호 입력 폼
- 로그인 처리 (Supabase Auth)
- 사용자 타입에 따른 리다이렉션
  - 학생 → `/(student)`
  - 학부모 → `/(parent)`
  - 관리자 → `/(admin)`

#### 2.2 회원가입 - 학생 (`/signup/student`)
- 이메일, 비밀번호, 이름, 전화번호, 좌석번호
- 회원가입 완료 시 학부모 연결 코드 자동 생성
- 연결 코드 표시 및 복사 기능

#### 2.3 회원가입 - 학부모 (`/signup/parent`)
- 이메일, 비밀번호, 이름, 전화번호
- 학생 연결 코드 입력
- 코드 검증 후 학생과 연결

#### 2.4 비밀번호 찾기 (`/forgot-password`)
- 이메일 입력
- Supabase 비밀번호 재설정 이메일 발송

#### 2.5 미들웨어
- 인증되지 않은 사용자 → 로그인 페이지로 리다이렉트
- 인증된 사용자가 잘못된 경로 접근 시 → 본인 타입 페이지로 리다이렉트

#### 완료 기준
- [ ] 로그인 페이지 및 기능
- [ ] 학생 회원가입 페이지 및 기능
- [ ] 학부모 회원가입 페이지 및 기능
- [ ] 비밀번호 찾기 페이지 및 기능
- [ ] 인증 미들웨어 설정
- [ ] 사용자 타입별 리다이렉션

---

### Phase 3: 학생 웹

#### 3.1 메인 대시보드 (`/(student)/page.tsx`)
- **타이머 스타일 학습시간 표시** (화면 중앙, 크게)
  - 오늘의 학습시간 (실시간 증가)
  - 입실 상태 표시 (입실중/퇴실/외출중)
- 주간 목표 달성률 간단히 표시
- 하단 탭 네비게이션

#### 3.2 등원 목표 설정 (`/(student)/goal`)
- 등원 목표 시간 선택 (시/분 피커)
- 오늘 목표 설정/수정
- 목표 달성 여부 표시
- 주간 목표 달성 현황

#### 3.3 과목 설정 (`/(student)/subject`)
- 과목 목록 (국어, 수학, 영어, 과학, 사회, 기타)
- 현재 학습 중인 과목 선택
- 과목 변경 기록

#### 3.4 몰입도 확인 (`/(student)/focus`)
- 오늘의 몰입도 점수
- 주간 몰입도 그래프 (차트)
- 과목별 몰입도 통계

#### 3.5 상벌점 내역 (`/(student)/points`)
- 상벌점 목록 (날짜, 사유, 점수)
- 누적 상점/벌점 표시
- 필터 (상점/벌점/전체)

#### 3.6 학생 레이아웃
- 하단 탭 네비게이션 (홈, 목표, 과목, 몰입도, 상벌점, 채팅)
- 상단 헤더 (프로필, 설정)

#### 완료 기준
- [ ] 메인 대시보드 (타이머 뷰)
- [ ] 등원 목표 설정 페이지
- [ ] 과목 설정 페이지
- [ ] 몰입도 확인 페이지
- [ ] 상벌점 내역 페이지
- [ ] 학생 레이아웃 및 네비게이션

---

### Phase 4: 학부모 웹

#### 4.1 메인 대시보드 (`/(parent)/page.tsx`)
- 연결된 학생 정보 표시
- 학생 현재 상태 (입실/퇴실/외출)
- 오늘 학습시간
- 현재 학습 과목
- 오늘의 몰입도 점수

#### 4.2 스케줄 승인 (`/(parent)/schedule`)
- 승인 대기 목록
- 승인/거부 버튼
- 승인 완료 내역

#### 4.3 학부모 레이아웃
- 하단 탭 네비게이션 (홈, 스케줄, 채팅)
- 상단 헤더

#### 완료 기준
- [ ] 메인 대시보드 (학생 상태)
- [ ] 스케줄 승인 페이지
- [ ] 학부모 레이아웃 및 네비게이션

---

### Phase 5: 관리자 웹

#### 5.1 학생 현황 대시보드 (`/(admin)/page.tsx`)
- 전체 학생 목록 테이블
  - 좌석번호, 이름, 상태, 현재 과목, 오늘 학습시간
- 상태별 필터 (입실/퇴실/외출/전체)
- 과목 미설정 학생 하이라이트
- 과목 직접 입력 기능

#### 5.2 몰입도 관리 (`/(admin)/focus`)
- 학생 선택
- 몰입도 점수 입력 (1-10점)
- 빠른 입력 버튼 (완전몰입 10점, 인강 8점, 졸음 5점)
- 몰입도 리포트 (주간)
- PDF/엑셀 다운로드

#### 5.3 상벌점 관리 (`/(admin)/points`)
- 상벌점 현황 테이블
- 수동 상벌점 부여
  - 학생 선택, 유형(상점/벌점), 사유, 점수
- 자동 부여 규칙 설정
  - 지각 벌점
  - 목표 달성 상점

#### 5.4 회원 관리 (`/(admin)/members`)
- 학생 목록 (프로필, 학습이력, 상벌점)
- 학부모 목록 (연결된 학생 정보)
- 회원 정보 수정

#### 5.5 알림 관리 (`/(admin)/notifications`)
- 알림 발송 현황
- 자동 알림 설정 (지각/결석)

#### 5.6 데이터 다운로드 (`/(admin)/download`)
- 데이터 유형 선택 (학생, 학습시간, 몰입도, 상벌점)
- 기간 선택
- 엑셀 다운로드

#### 5.7 관리자 레이아웃
- 사이드바 네비게이션 (PC 최적화)
- 상단 헤더

#### 완료 기준
- [ ] 학생 현황 대시보드
- [ ] 몰입도 관리 페이지
- [ ] 상벌점 관리 페이지
- [ ] 회원 관리 페이지
- [ ] 알림 관리 페이지
- [ ] 데이터 다운로드 페이지
- [ ] 관리자 레이아웃 및 네비게이션

---

### Phase 6: 3자 채팅 시스템

#### 6.1 채팅방 구조
- 학생당 1개의 3자 채팅방 자동 생성
- 참여자: 학생, 학부모, 관리자

#### 6.2 채팅 기능
- 실시간 메시지 전송/수신 (Supabase Realtime)
- 메시지 목록 표시
- 읽음 표시 (사용자별)
- 입력창 및 전송 버튼

#### 6.3 채팅 페이지
- 학생: `/(student)/chat`
- 학부모: `/(parent)/chat`
- 관리자: `/(admin)/chat` (채팅방 목록 + 채팅)

#### 완료 기준
- [ ] Supabase Realtime 설정
- [ ] 채팅 컴포넌트 개발
- [ ] 학생 채팅 페이지
- [ ] 학부모 채팅 페이지
- [ ] 관리자 채팅 관리 페이지
- [ ] 읽음 표시 기능

---

### Phase 7: 핵심 인프라 확장 (0127 미팅 반영)

> 다른 기능들의 기반이 되는 핵심 설정 및 DB 스키마 확장

#### 7.1 하루 시간 기준 적용 [필수]
- **하루 시작**: KST 07:30
- **하루 종료**: 다음날 KST 01:30
- **주 시작**: 일요일
- 모든 날짜/시간 계산 로직에 적용
- 새벽 1:30 이후 입실 → 다음 날짜로 계산

```typescript
// lib/constants.ts에 추가
export const DAY_CONFIG = {
  startHour: 7,
  startMinute: 30,
  endHour: 25,  // 다음날 01:30 = 25:30으로 계산
  endMinute: 30,
  weekStartsOn: 0,  // 일요일
} as const;
```

#### 7.2 지점(브랜치) 관리 [필수]
- 다중 지점 지원 (압구정, 방구석, 잠실 등)
- 가입 시 지점 선택
- 지점별 필터링/정렬

```sql
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- profiles에 지점 연결
ALTER TABLE profiles ADD COLUMN branch_id UUID REFERENCES branches(id);
```

#### 7.3 날짜 타입 시스템 [필수]
- 타입 종류: 학기중, 방학, 특수상황 등
- 관리자가 날짜 범위에 타입 지정
- 타입별 의무 시작/종료 시간 설정

```sql
-- 날짜 타입 정의 테이블
CREATE TABLE date_type_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  name TEXT NOT NULL,  -- '학기중', '방학', '특수' 등
  default_start_time TIME NOT NULL,
  default_end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 날짜별 타입 지정 테이블
CREATE TABLE date_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  date DATE NOT NULL,
  date_type_id UUID REFERENCES date_type_definitions(id),
  custom_start_time TIME,
  custom_end_time TIME,
  UNIQUE(branch_id, date)
);
```

#### 7.4 회원가입 필드 추가
- 학생: 생일 필수 입력
- 지점 선택 추가

#### 완료 기준
- [ ] DAY_CONFIG 상수 및 시간 유틸리티 함수 구현
- [ ] branches 테이블 및 지점 관리 기능
- [ ] date_type_definitions, date_assignments 테이블 생성
- [ ] 날짜 타입 관리 관리자 페이지
- [ ] 회원가입 폼 수정 (생일, 지점)
- [ ] 기존 시간 계산 로직 업데이트

---

### Phase 8: 학생 타입 및 스케줄 시스템

> 학생 타입 분류 및 부재 스케줄 관리

#### 8.1 학생 타입 시스템 [중요]
- 학년/타입별 분류 (고3, 재수생, 고1 이하 등)
- 타입별 주간 목표 시간 중앙 설정
- 타입별 선택 가능한 과목 설정

```sql
CREATE TABLE student_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  name TEXT NOT NULL,
  weekly_goal_hours INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 타입별 선택 가능 과목
CREATE TABLE student_type_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_type_id UUID REFERENCES student_types(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- student_profiles에 타입 연결
ALTER TABLE student_profiles ADD COLUMN student_type_id UUID REFERENCES student_types(id);
```

#### 8.2 학생 부재 스케줄 등록 [필수]
- 학생이 부재 시간 캘린더 형태로 등록
- 일회성 / 반복(주기적) 스케줄 지원
- 온/오프 토글로 활성화 제어
- 관리자, 학부모 읽기 전용 확인

```sql
CREATE TABLE student_absence_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_type TEXT CHECK (recurrence_type IN ('weekly', 'monthly', 'one_time')),
  day_of_week INTEGER[],  -- 0=일, 1=월, ..., 6=토
  
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  date_type TEXT CHECK (date_type IN ('semester', 'vacation', 'all')),
  valid_from DATE,
  valid_until DATE,
  specific_date DATE,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 완료 기준
- [ ] student_types 테이블 및 관리자 설정 페이지
- [ ] student_type_subjects 테이블 및 타입별 과목 관리
- [ ] student_absence_schedules 테이블 생성
- [ ] 학생 부재 스케줄 등록 UI (캘린더 블록)
- [ ] 학부모/관리자 스케줄 확인 페이지
- [ ] 과목 선택 페이지 타입별 필터링

---

### Phase 9: 출결 및 목표 시스템 고도화

> 출결 처리 로직 고도화 및 교시제 기능

#### 9.1 출결 관리 고도화 [필수]
- **15분 외출 로직**:
  - 15분 이내 복귀: 재실 상태 유지
  - 15분 초과 복귀: 퇴실 → 재입실 처리
- **학부모 뷰 특수 처리**: 짧은 외출도 "퇴실"로 표시
- 의무 시간 기반 지각/조기퇴실 자동 벌점

```typescript
const GRACE_PERIOD_MINUTES = 15;

// 출결 처리 로직
// 외출 시작 시간과 복귀 시간 비교
// 15분 초과 시 별도 퇴실/입실 기록 생성
// 15분 이내 시 외출 기록만 남기고 재실 상태 유지
```

#### 9.2 교시제 기능 [중요]
- 관리자가 시간표(교시) 설정
- 날짜 타입별(학기/방학/특수)로 다른 시간표
- 학생 출입관리와 별개 (관리용)

```sql
CREATE TABLE period_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  date_type_id UUID REFERENCES date_type_definitions(id),
  period_number INTEGER NOT NULL,
  name TEXT,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, date_type_id, period_number)
);
```

#### 9.3 주간 목표 달성 시스템
- 학생 타입별 주간 목표 자동 적용
- 순봉시간(순수 학습시간) 계산
- 주간 달성도 표시

#### 완료 기준
- [ ] 15분 외출 로직 구현
- [ ] 학부모 뷰 퇴실 표시 로직
- [ ] 의무 시간 기반 자동 벌점 시스템
- [ ] period_definitions 테이블 및 관리 페이지
- [ ] 주간 목표 달성도 계산 및 표시

---

### Phase 10: 알림 시스템 고도화

> 채널 분리 및 웹 푸시 구현

#### 10.1 알림 채널 분리
| 대상 | 채널 | 비고 |
|------|------|------|
| 학부모 | 카카오톡 알림톡 | 실시간 |
| 학생 | 웹 브라우저 Push | 독서실 내 카카오톡 차단 |
| 학생 | 앱 내 알림 | 즉시 확인 |

#### 10.2 알림 목록 페이지
- 전체 알림 목록 확인
- 읽음/안읽음 상태 관리

#### 완료 기준
- [ ] 웹 푸시 알림 구현 (Service Worker)
- [ ] 학생용 앱 내 알림 센터
- [ ] 알림 채널 분기 로직
- [ ] 알림 목록 페이지 (읽음 상태 관리)

---

### Phase 11: 외부 연동 및 배포

> 기존 Phase 7 → Phase 11로 이동

#### 11.1 CAPS API 연동
- **현재**: 목업 데이터로 개발
- **추후**: CAPS API 스펙 확정 후 연동
  - 입실/퇴실 이벤트 수신
  - 학습시간 자동 계산
  - 지각 감지 및 자동 벌점

#### 11.2 카카오 알림톡 연동
- 카카오 비즈니스 알림톡 API 연동
- 알림 유형별 템플릿
  - 지각 알림
  - 결석 알림
  - 상벌점 알림
- 발송 기록 저장

#### 11.3 배포
- Vercel 배포 (또는 선택한 플랫폼)
- 환경변수 설정
- 도메인 연결
- SSL 설정

#### 완료 기준
- [ ] CAPS API 연동 인터페이스 준비
- [ ] 카카오 알림톡 연동
- [ ] 배포 완료
- [ ] 도메인 및 SSL 설정

---

## 참고 사항

### 인증 정책
- 소셜 로그인 없음 (이메일+비밀번호만)
- 이메일 인증 없음
- 비밀번호 찾기는 이메일로 재설정 링크 발송

### 사용자 타입
- 3가지 타입 완전 분리 (student, parent, admin)
- 복합 권한 없음 (관리자면서 학생 불가)

### CAPS 연동
- API 스펙 수신 전까지 목업 데이터 사용
- 수동 입실/퇴실 체크 기능으로 대체 가능

### 알림톡
- 카카오 비즈니스 채널 이미 있음
- 알림톡 템플릿 승인 필요
