# 루트스터디 앱 전환 + 신규 기능 개발 로드맵

> 이 문서는 범위·스펙의 기준 문서다. 운영 전제(스토어 계정 주체, 빌드 방식 등)가 바뀌면 해당 절을 갱신한다.
> 실시간 진행 상황은 PROGRESS.md를 참고한다.

---

## 1. 프로젝트 개요

### 1.1 현재 상태

| 항목 | 현재 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) + React 19 |
| 스타일 | Tailwind CSS v4 |
| DB/Auth | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| 외부 연동 | CAPS(출입 MSSQL), NCloud SENS(알림톡) |
| 배포 | Vercel |
| 모바일 | 반응형 웹 (PWA manifest 있음), 네이티브 앱 없음 |
| 결제 | 없음 |
| 푸시 알림 | 없음 (앱 내 알림 + 카카오 알림톡만) |

### 1.2 목표

- 학생/학부모 앱을 **Expo React Native WebView 쉘**로 iOS/Android 네이티브 앱 전환
- **급식 신청/결제** 시스템 신규 개발 (나이스페이먼츠 연동)
- **멘토링/클리닉 신청** 시스템 신규 개발
- 네이티브 푸시 알림, 자동 로그인, 파일/사진 첨부 기능 추가
- App Store / Google Play 정식 배포

### 1.3 제외 범위

- 견적서 9번 항목(기존 웹 기능 개선) — 별도 진행
- 관리자 앱 전환 — 기존 웹 유지
- 모의고사 신청, AI 학습통계 리포트 — 향후 확장

### 1.4 일정

| 구분 | 기간 |
|------|------|
| 전체 | 10주 |
| Phase 1~4 (앱 인프라) | 1~7주차 |
| Phase 5~6 (급식) | 7~10주차 |
| Phase 7~8 (멘토링) | 10~14주차 |
| 통합 QA + 스토어 배포 | 병행 |

### 1.5 참조 자료

| 자료 | 경로 | 용도 |
|------|------|------|
| 견적서 | `.00_manager/client/최종 추가 견적서/20260312_루트스터디앱_통합견적서.txt` | 개발 범위 정의 |
| 옛 앱 (Android) | `.manager/ref/LUsoft-Android-rootstudycenter-Source-260312/` | WebView 쉘, FCM, 결제 scheme 처리 참조 |
| 옛 앱 (iOS) | `.manager/ref/LUsoft-iOS-rootstudycenter-source-260312/` | WKWebView, APNs, IAP 참조 |
| NICEPay 매뉴얼 | `.manager/ref/nicepay-manual/` | 결제 연동 API 상세 |

### 1.6 현재 개발 전제 (클라이언트 Apple/Google 개발자 계정 전)

클라이언트가 **Apple Developer / Google Play 개발자 계정**을 아직 제공하지 않은 경우, 아래 순서로 진행한다.

| 구분 | 내용 |
|------|------|
| 계정 | **개발자 본인 Expo 계정**으로 EAS 프로젝트 연결·빌드 |
| 일상 개발 | 로컬: 루트 `npm run app:ios` / `app:android`(또는 `studycafe-app`에서 `expo start` + 시뮬레이터/에뮬레이터). WebView·브리지·웹 연동은 여기서 검증 |
| 클라우드 스모크 (선택) | EAS에서 **iOS 시뮬레이터 산출물** 위주로 스모크(실기기 서명·TestFlight 없이 진행 가능한 경로). Android는 에뮬레이터/APK 내부 배포 등으로 병행 가능 |
| 보류 | 실기기용 iOS/Android **프로덕션 서명**, **AASA / assetlinks 실값**(Team ID·SHA256), **App Store Connect / Play Console 앱 등록**, TestFlight·내부 테스트 트랙 **연결** — 클라이언트 계정·번들/패키지 확정 후 일괄 처리 |

`.well-known`의 플레이스홀더는 **배포 도메인 구조만 유지**하고, 실값 치환은 위 보류 항목과 함께 진행한다.

---

## 2. 아키텍처

### 2.1 전체 구조

```
┌─────────────────────────────────────────────┐
│         Expo React Native App Shell         │
│  ┌───────────────────────────────────────┐  │
│  │  expo-notifications (FCM/APNs)        │  │
│  │  expo-secure-store (토큰 저장)         │  │
│  │  expo-image-picker / document-picker  │  │
│  │  expo-linking (딥링크)                 │  │
│  │  카드사 앱 scheme 처리                  │  │
│  └───────────┬───────────────────────────┘  │
│              │ postMessage / inject JS       │
│  ┌───────────▼───────────────────────────┐  │
│  │         react-native-webview          │  │
│  │    (기존 Next.js 웹 전체 임베드)        │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│      Next.js 16 (Vercel) — 기존 웹앱        │
│  학생/학부모 UI, 관리자 UI                    │
│  급식/멘토링 신규 페이지                      │
│  NICEPay JS SDK (결제창)                     │
│  API Routes (결제 승인/취소/웹훅, 푸시 발송)   │
└───────────────────┬─────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   Supabase      NICEPay    NCloud SENS
   (DB/Auth/     (결제/환불)  (알림톡)
    Storage/
    Realtime)
```

### 2.2 네이티브 vs 웹 구분

#### 네이티브(Expo)로 구현

| 기능 | Expo 패키지 | 이유 |
|------|------------|------|
| 푸시 알림 | expo-notifications | FCM/APNs 토큰 발급, 백그라운드 수신 |
| 자동 로그인 | expo-secure-store | OS 키체인/키스토어에 토큰 보안 저장 |
| 사진/카메라 | expo-image-picker | 갤러리/카메라 네이티브 접근 |
| 파일 선택 | expo-document-picker | 파일시스템 네이티브 접근 |
| 딥링크 | expo-linking | 앱 URL scheme, Universal Links |
| 결제 앱 호출 | react-native-webview onShouldStartLoadWithRequest | ISP/카드사 앱 scheme 인텐트 처리 |
| 앱 아이콘/스플래시 | expo 기본 설정 | 스토어 필수 |

#### 웹(WebView 내 Next.js)으로 유지

| 기능 | 이유 |
|------|------|
| 모든 기존 학생/학부모/관리자 UI | 기존 코드 재사용, 유지보수 단일화 |
| 급식 신청/결제 UI | NICEPay JS SDK가 웹에서 동작 |
| 멘토링/클리닉 신청 UI | 서버 컴포넌트 + Supabase 직접 연동 |
| 관리자 기능 전체 | 관리자는 웹 유지 (앱 전환 없음) |
| 채팅 | Supabase Realtime, 기존 구현 유지 |

#### 브리지(Native ↔ Web 통신)

| 데이터 | 방향 | 방식 |
|--------|------|------|
| Supabase 세션 | Native → Web | 앱 시작 시 SecureStore에서 refresh_token 복원 → WebView injectedJavaScript로 localStorage에 주입 |
| 로그인 상태 변경 | Web → Native | postMessage로 로그인/로그아웃 이벤트 전달 → SecureStore 갱신 |
| 푸시 토큰 | Native → Web | 토큰 발급 후 postMessage → Web에서 API 호출하여 서버 등록 |
| 파일 업로드 | Native → Web | picker 결과를 Native에서 Supabase Storage 직접 업로드 → URL을 postMessage로 Web에 전달 |
| 딥링크 | Native → Web | URL 수신 → WebView URL 변경 |
| 결제 앱 scheme | Web → Native | WebView URL 변경 감지 → Native에서 Linking.openURL() |

### 2.3 postMessage 프로토콜

Native ↔ WebView 간 JSON 메시지 규약:

```typescript
// Native → Web (injectedJavaScript 또는 postMessage)
{ type: 'SESSION_INJECT', payload: { access_token, refresh_token } }
{ type: 'PUSH_TOKEN',     payload: { expo_push_token, platform } }
{ type: 'FILE_UPLOADED',  payload: { url, filename, mime_type } }
{ type: 'DEEP_LINK',      payload: { path } }

// Web → Native (window.ReactNativeWebView.postMessage)
{ type: 'LOGIN_SUCCESS',  payload: { access_token, refresh_token } }
{ type: 'LOGOUT',         payload: {} }
{ type: 'PICK_IMAGE',     payload: { source: 'camera' | 'gallery' } }
{ type: 'PICK_FILE',      payload: {} }
{ type: 'REQUEST_PUSH_TOKEN', payload: {} }
```

---

## 3. Phase 1: 앱 쉘 구성

> 견적서 1번 | 1~2주차 | 6.4일

### 3.1 목표

Expo 기반 iOS/Android 앱 프로젝트를 생성하고, 기존 Next.js 웹을 WebView로 임베드한다.

### 3.2 작업 목록

#### 3.2.1 Expo 프로젝트 초기 구성

- 프로젝트 구조: 단일 Git 저장소 `studycafe/` 루트에 Next.js 웹 + 서브디렉터리 `studycafe-app/`(Expo). (과거: 형제 폴더에만 두었던 경우 레포 안으로 통합)
- `npx create-expo-app` → TypeScript 템플릿
- 주요 의존성: `react-native-webview`, `expo-linking`, `expo-constants`
- `app.json` 설정: bundleIdentifier, package name, scheme

#### 3.2.2 WebView 연동

- `react-native-webview`로 기존 웹 URL 로딩
- User-Agent에 `RootStudyApp/1.0` 추가 (웹에서 앱 여부 감지용)
- WebView ↔ Native postMessage 통신 기반 구축
- 쿠키/localStorage 영속성 설정
- 뒤로가기 핸들링 (Android 하드웨어 백버튼)

#### 3.2.3 앱 아이콘 / 스플래시 스크린

- 앱 아이콘 (1024x1024 PNG) → `app.json` icon 설정
- 스플래시 스크린 (expo-splash-screen) → 세션 복원 완료 시까지 표시
- 적응형 아이콘 (Android adaptive icon)

#### 3.2.4 딥링크

- URL scheme 등록: `rootstudy://`
- Universal Links (iOS) / App Links (Android) 설정
- 딥링크 수신 → WebView URL 매핑:
  - `rootstudy://student/chat` → `/student/chat`
  - `rootstudy://parent/announcements/123` → `/parent/announcements/123`

#### 3.2.5 EAS Build 파이프라인

- `eas.json` 설정 (development, preview, production 프로필)
- **계정 전(개발 단계)**: 본인 Expo 계정으로 EAS 연동. 로컬 시뮬레이터/에뮬레이터로 기능 검증. 필요 시 EAS **iOS 시뮬레이터** 빌드 등으로 클라우드 스모크(실기기 서명·스토어 없이)
- **클라이언트 Apple/Google 계정 확보 후**: EAS로 **실기기** iOS/Android 빌드, TestFlight·Internal Testing 연결, App Store Connect·Play Console 앱 등록, AASA·`assetlinks.json` 실값 반영 및 도메인 검증

### 3.3 참조 (옛 앱)

- `config.json`의 `HostUrl`, `StartUrl` 패턴 → WebView 초기 URL 설정 방식
- `MainActivityA.java` → WebView 초기화, 쿠키 설정, User-Agent 주입
- `MainViewController.swift` → WKWebView 설정, 쿠키 공유
- `WebClient.java` → URL 오버라이드, 외부 링크 처리

### 3.4 웹 측 변경사항

- User-Agent 기반 앱 감지 유틸 추가 (`src/lib/utils.ts`에 `isNativeApp()`)
- 앱 전용 레이아웃 분기 (상단 safe-area 패딩, 하단 네비 조정 등)
- Next.js middleware에서 앱 User-Agent 감지 시 처리

---

## 4. Phase 2: 푸시 알림 시스템

> 견적서 2번 | 2~4주차 | 8.0일

### 4.1 목표

Expo Push Notification을 통해 공지/채팅/멘토링 알림을 실시간 푸시로 발송한다.

### 4.2 DB 스키마 (신규)

```sql
CREATE TABLE push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  device_id text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, expo_push_token)
);

CREATE INDEX idx_push_tokens_user ON push_tokens(user_id) WHERE is_active = true;
```

### 4.3 작업 목록

#### 4.3.1 Native 측 (Expo)

- `expo-notifications` 설정
- FCM 서버 키 등록 (Android): `google-services.json`
- APNs 인증서 등록 (iOS): Apple Developer 포털에서 .p8 키 발급 → Expo 대시보드 업로드
- 앱 시작 시 푸시 권한 요청 → 토큰 발급
- 토큰을 postMessage로 WebView에 전달 → 서버 등록 API 호출
- 포그라운드 알림 표시 설정
- 알림 탭 시 딥링크 처리: `notification.data.path` → WebView URL 변경

#### 4.3.2 서버 측 (Next.js API Routes)

**토큰 관리 API**:
- `POST /api/push/register` — 토큰 등록/갱신
- `DELETE /api/push/unregister` — 토큰 삭제 (로그아웃 시)

**푸시 발송 API**:
- `POST /api/push/send` — 내부 전용 (서버 액션에서 호출)
- Expo Push API (`https://exp.host/--/api/v2/push/send`) 호출
- 배치 발송: 최대 100건씩 묶어서 발송

**푸시 발송 유틸** (`src/lib/push.ts`):
```typescript
interface PushPayload {
  to: string[];           // expo push tokens
  title: string;
  body: string;
  data?: { path: string; type: string };
  sound?: 'default';
  badge?: number;
}

async function sendPush(payload: PushPayload): Promise<void>;
async function sendPushToUser(userId: string, notification: {...}): Promise<void>;
async function sendPushToBranch(branchId: string, notification: {...}): Promise<void>;
```

#### 4.3.3 트리거별 발송 연동

| 트리거 | 수신자 | 딥링크 |
|--------|--------|--------|
| 공지사항 등록 | 해당 지점 전체 학생/학부모 | `/student/announcements/{id}` 또는 `/parent/announcements/{id}` |
| 채팅 메시지 | 상대방 (학생↔관리자, 학부모↔관리자) | `/student/chat` 또는 `/parent/chat` |
| 멘토링 신청 확정 | 해당 학생 + 학부모 | `/student/mentoring/my` 또는 `/parent/mentoring/my` |
| 멘토링 신청 거절 | 해당 학생 + 학부모 | 동일 |
| 급식 결제 완료 | 해당 사용자 | `/student/meals/orders` 또는 `/parent/meals/orders` |

#### 4.3.4 기존 알림 시스템 연동

- `student_notifications` / `user_notifications` insert 시 동시에 푸시 발송
- 기존 `sendAlimtalk` (카카오 알림톡)과 병행 — 앱 미설치 사용자 대비

### 4.4 참조 (옛 앱)

- `FCM.java`: 토픽 구독 (`news`, `and-user`), 토큰 갱신 로직
- `FCMReceiver.java`: 데이터 필드 `title`, `body`, `sound`, `task_id`, `badge`
- `api_savePushInfo2.php`: 토큰 등록 API 호출 패턴

---

## 5. Phase 3: 자동 로그인 / 세션 관리

> 견적서 3번 | 4~5주차 | 6.4일

### 5.1 목표

앱 재실행 시 자동 로그인, WebView에 세션 주입, 비밀번호 재설정 기능.

### 5.2 작업 목록

#### 5.2.1 SecureStore 기반 토큰 저장

- 로그인 성공 시: Web → postMessage(`LOGIN_SUCCESS`) → Native가 `expo-secure-store`에 `refresh_token` 저장
- 로그아웃 시: Web → postMessage(`LOGOUT`) → Native가 SecureStore 삭제 + 푸시 토큰 해제

#### 5.2.2 앱 시작 시 자동 로그인 플로우

```
앱 시작
  → 스플래시 표시
  → SecureStore에서 refresh_token 읽기
  → 없으면: WebView 로그인 페이지 로드
  → 있으면:
    → Supabase setSession(refresh_token) 시도
    → 성공: access_token + refresh_token을 WebView에 주입 (injectedJavaScript)
    → 실패 (만료): SecureStore 삭제 → 로그인 페이지
  → 스플래시 숨김
```

#### 5.2.3 WebView 세션 주입

- `injectedJavaScriptBeforeContentLoaded`로 Supabase 세션 복원:
  ```javascript
  // WebView에 주입할 JS
  localStorage.setItem('sb-{project-ref}-auth-token', JSON.stringify({
    access_token: '...',
    refresh_token: '...',
    ...
  }));
  ```
- WebView `onMessage` 핸들러에서 로그인/로그아웃 이벤트 수신
- Supabase `onAuthStateChange` 리스너에서 Web → Native 토큰 동기화

#### 5.2.4 비밀번호 재설정

- 현재: `/forgot-password` 페이지 존재 (Supabase Auth resetPasswordForEmail)
- 추가: 6자리 코드 방식
  - DB 테이블 `password_reset_codes (id, email, code, expires_at, used_at)` 또는 Supabase Auth OTP 활용
  - 이메일 발송 → 코드 입력 → 비밀번호 변경

### 5.3 참조 (옛 앱)

- `Config.java`: `SharedPreferences`에 토큰 저장/읽기 패턴
- `LusoftA.hybridGetMbid(mb_id)`: 로그인 성공 후 FCM 토큰 서버 등록
- `IntroActivity.java`: 앱 시작 → 자동 로그인 판단 → 메인/로그인 분기

---

## 6. Phase 4: 파일/사진 첨부

> 견적서 4번 | 5~7주차 | 7.2일

### 6.1 목표

채팅과 공지사항에서 이미지/파일을 첨부할 수 있도록 한다.

### 6.2 DB 스키마 변경

기존 `chat_messages` 테이블에 `image_url` 컬럼이 이미 존재함. 추가 변경:

```sql
-- chat_messages에 파일 관련 컬럼 추가
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_type text; -- 'image', 'file'

-- announcements에 첨부파일 지원
CREATE TABLE announcement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  mime_type text,
  created_at timestamptz DEFAULT now()
);
```

### 6.3 Supabase Storage 버킷

| 버킷 | 용도 | 접근 |
|------|------|------|
| `chat-files` | 채팅 이미지/파일 | 해당 채팅방 참여자만 |
| `announcement-files` | 공지사항 첨부 | 해당 지점 회원 |

### 6.4 작업 목록

#### 6.4.1 Native 측

- `expo-image-picker`: 카메라 촬영 / 갤러리 선택
- `expo-document-picker`: 파일 선택 (PDF, DOC 등)
- Web에서 `PICK_IMAGE` / `PICK_FILE` 메시지 수신 → Native picker 실행
- picker 결과 → Supabase Storage 직접 업로드 (Native에서 supabase-js 사용)
- 업로드 완료 후 `FILE_UPLOADED` 메시지로 URL 전달

#### 6.4.2 웹 측

- 채팅: 파일 첨부 버튼 추가 → 앱이면 postMessage(`PICK_IMAGE`/`PICK_FILE`), 웹이면 `<input type="file">`
- 채팅: 이미지 메시지 렌더링 (썸네일 + 탭 시 확대)
- 채팅: 파일 메시지 렌더링 (파일명 + 다운로드 링크)
- 공지사항: 관리자 작성 시 파일 첨부 UI
- 공지사항: 첨부파일 목록 표시 + 다운로드

#### 6.4.3 파일 미리보기/다운로드

- 이미지: WebView 내 라이트박스 (이미 있으면 활용, 없으면 추가)
- PDF/문서: 새 탭/외부 앱으로 열기
- 파일 사이즈 제한: 이미지 10MB, 파일 20MB

#### 6.4.4 Storage 정리/보안

- `deleteAnnouncementAttachment`에서 DB 행 삭제 시 **Storage 객체도 함께 삭제** (현재 고아 파일 누적 가능)
- 공개 버킷 정책 재검토: 현재 `chat-files`·`announcement-files`가 public → URL만 알면 누구나 GET 가능. 민감 문서가 올라갈 수 있으므로 **signed URL 전환** 또는 **RLS 기반 비공개 버킷** 검토

### 6.5 참조 (옛 앱)

- Android: `LusoftA`의 파일 업로드 JS 브리지, `DownloadMng.java` 다운로드 처리
- iOS: `ImagePicker` 모듈, `WKUserInterface.swift` 파일 처리

### 6.6 Phase 4 병행: 앱 품질 보강

Phase 4 네이티브 작업과 함께 처리해야 할 크로스커팅 이슈들. Phase 5 진입 전에 완료한다.

#### 6.6.1 Safe Area 적용

현재 `globals.css`에 `pb-safe`가 정의돼 있으나 실사용처가 없고, `viewport-fit=cover`도 미설정.

- `src/app/layout.tsx` viewport 메타에 `viewportFit: 'cover'` 추가
- 학생/학부모 **상단 헤더**: `fixed top-4 left-4` → 네이티브 앱일 때 `safe-area-inset-top` 반영 (노치·상태바 겹침 방지)
- **하단 탭** (`bottom-nav.tsx`): `fixed bottom-0` → `pb-safe` 클래스 적용 (홈 인디케이터 겹침 방지)
- 사이드바 열림 시에도 safe area 고려

#### 6.6.2 KST 타임존 규칙 준수

프로젝트 규칙 `timezone-kst.mdc`에 따라 날짜/시간 표시 시 `timeZone: 'Asia/Seoul'` 필수이나 여러 곳에서 누락.

- `chat-message-item.tsx`: `date-fns format()` → KST 기준 표시로 전환 (또는 `toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })`)
- `chat-message-list.tsx`: 날짜 구분선 → KST 기준
- `announcements-client.tsx` (학생/학부모/관리자): `formatDate`·`formatFullDate`에 `timeZone: 'Asia/Seoul'` 추가

#### 6.6.3 WebView 로딩 실패 대응

현재 스플래시가 `onLoadEnd`에만 의존 → 로딩 실패 시 영구 표시 가능.

- `WebViewScreen`에 `onError` 핸들러 추가 → 스플래시 숨김 + 오프라인/에러 안내 화면 + 재시도 버튼
- 네트워크 상태 감지 (`NetInfo`) → 오프라인 시 사전 안내 (선택)

#### 6.6.4 SESSION_INJECT 딥링크 복귀

현재 `SESSION_INJECT` 성공 후 무조건 `location.href = '/'`로 이동 → 딥링크로 진입한 사용자가 원래 목적 페이지를 잃음.

- `SESSION_INJECT` payload에 `returnPath` 추가 (네이티브가 딥링크 경로를 함께 전달)
- `AuthBridge`에서 `returnPath`가 있으면 해당 경로로 이동, 없으면 `/`

#### 6.6.5 채팅 스크롤 수정

이전 메시지 로드(prepend) 시에도 맨 아래로 스크롤하는 effect가 발동 → 사용자가 위로 스크롤한 위치를 잃음.

- `ChatMessageList`: 과거 메시지 prepend 시 **스크롤 위치 보존** (scrollTop + scrollHeight 차이 계산)
- 새 메시지 수신 시에만 맨 아래로 자동 스크롤 (또는 "새 메시지" 플로팅 버튼)

#### 6.6.6 Realtime 에러/재연결 처리

채팅·사이드바의 `postgres_changes` 구독에서 에러/타임아웃 시 피드백·재구독 없음.

- 채널 `subscribe` 콜백에서 에러 감지 → 사용자에게 "연결이 끊겼습니다" 배너 또는 토스트
- `CHANNEL_ERROR` / `TIMED_OUT` 시 자동 재구독 시도 (최대 3회, 지수 백오프)

#### 6.6.7 마이그레이션 파일 정비

`push_tokens` 테이블은 DB에 존재하나 `supabase/migrations/`에 SQL 없음 → 환경 재현 불가.

- `supabase/migrations/`에 Phase 2 `push_tokens` + RLS 마이그레이션 SQL 추가
- 기존 대시보드에서만 적용한 설정(Realtime publication 등)도 마이그레이션에 기록

#### 6.6.8 기타 UX 보강

- **승인 대기(pending) 페이지**: 현재 전체 네비(헤더+하단 탭)가 보임 → 탭 클릭 시 반복 리다이렉트. pending 전용 최소 레이아웃으로 전환하거나 하단 탭 숨김
- **학생 헤더 `seatNumber` prop**: 현재 전달만 하고 미사용 → 좌석 번호 표시 UI 추가 또는 dead prop 제거

---

## 7. Phase 5: 급식 신청/결제 (학생/학부모)

> 견적서 5번 | 7~9주차 | 9.6일

### 7.1 목표

학생/학부모가 급식 메뉴를 조회하고, 나이스페이먼츠로 결제하여 급식을 신청한다.

### 7.2 DB 스키마 (신규)

```sql
-- 급식 상품 (관리자가 등록)
CREATE TABLE meal_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  name text NOT NULL,                              -- '3월 중식', '3월 석식'
  meal_type text NOT NULL CHECK (meal_type IN ('lunch', 'dinner')),
  price integer NOT NULL,                           -- 원 단위
  sale_start_date date NOT NULL,                    -- 판매 시작일
  sale_end_date date NOT NULL,                      -- 판매 종료일
  meal_start_date date NOT NULL,                    -- 식사 시작일
  meal_end_date date NOT NULL,                      -- 식사 종료일
  max_capacity integer,                             -- 최대 인원 (null = 무제한)
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'sold_out')),
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 일별 메뉴
CREATE TABLE meal_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES meal_products(id) ON DELETE CASCADE,
  date date NOT NULL,
  menu_text text NOT NULL,                          -- '쌀밥, 된장찌개, 제육볶음, ...'
  created_at timestamptz DEFAULT now(),
  UNIQUE(product_id, date)
);

-- 급식 주문
CREATE TABLE meal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  student_id uuid NOT NULL REFERENCES profiles(id), -- 학부모가 자녀 대신 결제 시
  product_id uuid NOT NULL REFERENCES meal_products(id),
  order_id text NOT NULL UNIQUE,                    -- 가맹점 주문번호 (NICEPay용)
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded', 'failed')),
  tid text,                                         -- NICEPay 거래 ID
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_meal_orders_user ON meal_orders(user_id);
CREATE INDEX idx_meal_orders_student ON meal_orders(student_id);
CREATE INDEX idx_meal_orders_product ON meal_orders(product_id);

-- 결제 로그 (급식 + 향후 모의고사 등 공용)
CREATE TABLE payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_type text NOT NULL CHECK (order_type IN ('meal', 'exam', 'other')),
  order_id text NOT NULL,                           -- meal_orders.order_id 등
  tid text,
  action text NOT NULL CHECK (action IN ('auth', 'approve', 'cancel', 'webhook', 'netcancel')),
  amount integer,
  status text NOT NULL,                             -- 'success', 'fail'
  result_code text,
  result_msg text,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payment_logs_order ON payment_logs(order_type, order_id);
```

### 7.3 NICEPay 연동 상세

Server 승인 모델을 사용한다. `.manager/ref/nicepay-manual/` 기반.

#### 7.3.1 환경 설정

```
# .env.local
NICEPAY_CLIENT_ID=S2_xxxxx          # 결제창용 클라이언트 키
NICEPAY_SECRET_KEY=xxxxx             # API 인증용 시크릿 키
NICEPAY_RETURN_URL=https://xxx.vercel.app/api/payments/nicepay/confirm
NICEPAY_API_URL=https://api.nicepay.co.kr     # 운영
# NICEPAY_API_URL=https://sandbox-api.nicepay.co.kr  # 샌드박스
NICEPAY_PAY_URL=https://pay.nicepay.co.kr     # 운영
# NICEPAY_PAY_URL=https://sandbox-pay.nicepay.co.kr  # 샌드박스
```

#### 7.3.2 결제 플로우

```
[학생/학부모 앱]
  → 급식 상품 선택
  → '결제하기' 버튼 클릭
  → (WebView 내) Next.js 결제 페이지 로드
  → JS SDK: AUTHNICE.requestPay({
      clientId, method: 'card',
      orderId: 'MEAL-{uuid}',
      amount, goodsName: '3월 중식',
      returnUrl: '/api/payments/nicepay/confirm'
    })
  → [NICEPay 결제창] 카드 정보 입력 / 카드사 앱 인증
  → 카드사 앱 scheme 발생 시:
    → Native에서 Linking.openURL() 처리
    → 인증 완료 후 앱으로 복귀

[NICEPay → returnUrl POST]
  → /api/payments/nicepay/confirm 에서:
    1. authResultCode === '0000' 확인
    2. signature 위변조 검증: sha256(authToken + clientId + amount + secretKey)
    3. payment_logs INSERT (action: 'auth')
    4. POST {NICEPAY_API_URL}/v1/payments/{tid} (Basic Auth, amount)
       → 성공: meal_orders.status = 'paid', tid 저장
       → 실패: 에러 처리
       → Timeout: POST /v1/payments/netcancel (망취소)
    5. payment_logs INSERT (action: 'approve' 또는 'netcancel')
    6. 결제 완료 페이지로 리다이렉트 (또는 에러 페이지)
    7. 푸시 알림 발송 (결제 완료)
```

#### 7.3.3 취소/환불 플로우

```
[학생/학부모]
  → 신청 내역에서 '취소' 버튼 (식사일 2일 전까지)
  → Server Action: cancelMealOrder(orderId)
    1. 취소 가능 여부 확인 (meal_date - 2일 이상)
    2. POST {NICEPAY_API_URL}/v1/payments/{tid}/cancel
       → Headers: Authorization: Basic {base64(clientId:secretKey)}
       → Body: { reason, orderId }
    3. 성공: meal_orders.status = 'cancelled'
    4. payment_logs INSERT (action: 'cancel')

[관리자]
  → 상시 취소 가능 (날짜 제한 없음)
```

#### 7.3.4 웹훅

- `POST /api/payments/nicepay/webhook`
- 가상계좌 입금 알림 등 비동기 이벤트 수신 (향후 확장용)
- 응답: `Content-Type: text/html`, body: `"OK"`
- signature + amount 검증 필수

#### 7.3.5 카드사 앱 scheme 처리 (Native)

WebView `onShouldStartLoadWithRequest`에서 다음 scheme을 감지하여 `Linking.openURL()`:

| scheme | 앱 |
|--------|-----|
| `ispmobile://` | ISP/페이북 |
| `kftc-bankpay://` | 뱅크페이 |
| `kakaotalk://` | 카카오페이 |
| `supertoss://` | 토스 |
| `lpayapp://` | L.pay |
| `samsungpay://` | 삼성페이 |
| `shinhan-sr-ansimclick://` | 신한 앱카드 |
| `kb-acp://` | KB 앱카드 |
| `hdcardappcardansimclick://` | 현대 앱카드 |
| `lotteappcard://` | 롯데 앱카드 |
| `hanawalletmembers://` | 하나 앱카드 |
| `nhappcardansimclick://` | NH 앱카드 |
| `citimobileapp://` | 시티 앱카드 |
| `payco://` | 페이코 |
| `cloudpay://` | 하나 클라우드페이 |
| `intent://` | Android intent scheme |

참조: ref 앱 `WebClient.java`의 `shouldOverrideUrlLoading` 메서드

### 7.4 API Routes

| Method | Path | 용도 |
|--------|------|------|
| GET | `/api/meals/products` | 급식 상품 목록 (센터별) |
| GET | `/api/meals/products/{id}/menus` | 상품의 일별 메뉴 |
| POST | `/api/meals/orders` | 주문 생성 (결제 전) |
| POST | `/api/payments/nicepay/confirm` | NICEPay 인증 결과 수신 + 승인 |
| POST | `/api/payments/nicepay/cancel` | 결제 취소 |
| POST | `/api/payments/nicepay/webhook` | NICEPay 웹훅 수신 |
| POST | `/api/payments/nicepay/netcancel` | 망취소 |

### 7.5 UI 페이지 (학생/학부모)

| 경로 | 기능 |
|------|------|
| `/student/meals` | 급식 목록 (센터별 중식/석식, 날짜별 메뉴) |
| `/student/meals/{productId}` | 급식 상세 + 메뉴 + 결제 버튼 |
| `/student/meals/pay/{orderId}` | 결제 진행 페이지 (NICEPay JS SDK) |
| `/student/meals/pay/result` | 결제 완료/실패 결과 |
| `/student/meals/orders` | 신청 내역 (상태별 필터) |
| `/parent/meals` | 학부모 급식 목록 (자녀 선택) |
| `/parent/meals/{productId}` | 학부모 급식 상세 |
| `/parent/meals/orders` | 학부모 신청 내역 |

### 7.6 Server Actions

- `getMealProducts(branchId)` — 급식 상품 목록
- `getMealMenus(productId)` — 일별 메뉴
- `createMealOrder(productId, studentId)` — 주문 생성 (status: pending)
- `cancelMealOrder(orderId)` — 취소 (날짜 검증 포함)
- `getMealOrders(userId)` — 주문 내역

### 7.7 참조 (옛 앱)

- `WebClient.java`: `shouldOverrideUrlLoading` → 카드사 앱 scheme 처리 전체 목록
- `BillingManager.java`: 인앱결제 처리 패턴 (우리는 NICEPay PG 사용)
- `nicepay-manual/api/payment-window-server.md`: Server 승인 모델 상세
- `nicepay-manual/api/cancel.md`: 취소/환불 API
- `nicepay-manual/api/hook.md`: 웹훅 처리

---

## 8. Phase 6: 급식 관리 (관리자)

> 견적서 6번 | 9~10주차 | 3.0일

### 8.1 목표

관리자가 급식 상품을 등록/관리하고, 신청 현황을 확인하며, 강제 취소/환불 처리한다.

### 8.2 작업 목록

#### 8.2.1 급식 상품 관리

- 상품 등록 폼: 센터(지점), 식사유형(중식/석식), 이름, 가격, 판매기간, 식사기간, 최대 인원, 설명
- 상품 목록: 상태별 필터 (active/inactive/sold_out)
- 상품 수정/상태 변경

#### 8.2.2 메뉴 입력/수정

- 상품 선택 → 날짜별 메뉴 텍스트 입력
- 달력 형태 UI (식사 기간 내 날짜 표시)
- 벌크 입력 지원 (여러 날짜 한번에)

#### 8.2.3 신청 현황 대시보드

- 날짜별 신청 인원 집계 (중식/석식 구분)
- 학생 목록 (이름, 결제 상태, 취소 여부)
- Excel 다운로드

#### 8.2.4 관리자 취소/환불

- 날짜 제한 없이 상시 취소 가능
- 취소 사유 입력
- NICEPay cancel API 호출 → 환불 처리

### 8.3 UI 페이지 (관리자)

| 경로 | 기능 |
|------|------|
| `/admin/meals` | 급식 상품 목록 |
| `/admin/meals/new` | 상품 등록 |
| `/admin/meals/{id}` | 상품 상세/수정 |
| `/admin/meals/{id}/menus` | 메뉴 입력/수정 |
| `/admin/meals/{id}/orders` | 신청 현황 |

### 8.4 Server Actions

- `createMealProduct(data)` — 상품 등록
- `updateMealProduct(id, data)` — 상품 수정
- `upsertMealMenu(productId, date, menuText)` — 메뉴 입력/수정
- `getMealOrdersForAdmin(productId, date?)` — 관리자용 신청 현황
- `adminCancelMealOrder(orderId, reason)` — 관리자 강제 취소

---

## 9. Phase 7: 멘토링/클리닉 신청 (학생/학부모)

> 견적서 7번 | 10~12주차 | 8.64일

### 9.1 목표

학생/학부모가 멘토링/클리닉 슬롯을 캘린더에서 확인하고 신청한다.

### 9.2 DB 스키마 (신규)

```sql
-- 멘토(선생님)
CREATE TABLE mentors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  name text NOT NULL,
  subject text,                                     -- 주요 과목
  bio text,                                         -- 소개
  profile_image_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 멘토링/클리닉 유형
CREATE TYPE mentoring_type AS ENUM ('mentoring', 'clinic');

-- 멘토링 슬롯 (관리자가 등록)
CREATE TABLE mentoring_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  mentor_id uuid NOT NULL REFERENCES mentors(id),
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  type mentoring_type NOT NULL,                     -- 멘토링 / 클리닉
  subject text,                                     -- 과목
  capacity integer NOT NULL DEFAULT 1,              -- 정원
  booked_count integer NOT NULL DEFAULT 0,          -- 신청 인원
  location text,                                    -- 장소
  note text,                                        -- 비고
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_mentoring_slots_date ON mentoring_slots(branch_id, date);
CREATE INDEX idx_mentoring_slots_mentor ON mentoring_slots(mentor_id, date);

-- 멘토링 신청
CREATE TYPE application_status AS ENUM ('pending', 'confirmed', 'rejected', 'cancelled');

CREATE TABLE mentoring_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES mentoring_slots(id),
  user_id uuid NOT NULL REFERENCES profiles(id),    -- 신청자 (학생 또는 학부모)
  student_id uuid NOT NULL REFERENCES profiles(id), -- 대상 학생
  status application_status NOT NULL DEFAULT 'pending',
  note text,                                        -- 신청 시 메모
  reject_reason text,                               -- 거절 사유
  applied_at timestamptz DEFAULT now(),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(slot_id, student_id)                       -- 같은 슬롯에 같은 학생 중복 신청 방지
);

CREATE INDEX idx_mentoring_apps_slot ON mentoring_applications(slot_id);
CREATE INDEX idx_mentoring_apps_student ON mentoring_applications(student_id);
CREATE INDEX idx_mentoring_apps_user ON mentoring_applications(user_id);
```

### 9.3 작업 목록

#### 9.3.1 멘토링 캘린더

- 월간 캘린더 뷰: 신청 가능 슬롯이 있는 날짜 표시 (도트 또는 숫자)
- 날짜 선택 → 해당 날짜의 슬롯 목록 표시
- 슬롯 카드: 시간대, 멘토명, 과목, 유형(멘토링/클리닉), 잔여 좌석

#### 9.3.2 슬롯 선택 및 신청

- 슬롯 선택 → 신청 폼:
  - 신청자 정보 (자동 입력)
  - 대상 학생 (학부모인 경우 자녀 선택)
  - 메모 (선택)
- 신청 완료 → 상태: `pending` → 관리자 확인 대기

#### 9.3.3 신청 내역

- 상태별 탭: 전체 / 대기중 / 확정 / 취소·거절
- 각 신청 카드: 날짜, 시간, 멘토, 과목, 상태 배지
- 상세 보기: 확정/거절 사유

#### 9.3.4 신청 취소

- 취소 가능 조건: 슬롯 날짜/시간 전 (예: 24시간 전까지)
- 취소 시 `mentoring_slots.booked_count` 감소
- 취소 사유 입력

#### 9.3.5 알림 연동

- 신청 시: 관리자에게 알림 (앱 내 + 알림톡)
- 확정 시: 학생 + 학부모에게 푸시 + 알림톡
- 거절 시: 학생 + 학부모에게 푸시 + 알림톡

### 9.4 UI 페이지 (학생/학부모)

| 경로 | 기능 |
|------|------|
| `/student/mentoring` | 멘토링 캘린더 + 슬롯 목록 |
| `/student/mentoring/{slotId}/apply` | 신청 폼 |
| `/student/mentoring/my` | 내 신청 내역 |
| `/parent/mentoring` | 학부모 멘토링 캘린더 (자녀 선택) |
| `/parent/mentoring/{slotId}/apply` | 학부모 신청 폼 |
| `/parent/mentoring/my` | 학부모 신청 내역 |

### 9.5 Server Actions

- `getMentoringSlots(branchId, date?, type?)` — 슬롯 목록
- `getMentoringSlotDetail(slotId)` — 슬롯 상세 (멘토 정보 포함)
- `applyMentoring(slotId, studentId, note?)` — 신청
- `cancelMentoringApplication(applicationId, reason)` — 취소
- `getMyMentoringApplications(userId)` — 내 신청 내역

### 9.6 BottomNav 변경

학생/학부모 하단 네비게이션에 멘토링/급식 메뉴 추가 필요. 구조 재설계:

| 기존 | 변경안 |
|------|--------|
| 홈 / 통계 / 채팅 / 공지 / 더보기 | 홈 / 급식 / 멘토링 / 채팅 / 더보기 |

'더보기' 안에: 통계, 공지, 상벌점, 스케줄, 알림, 설정 등

### 9.7 참조 (옛 앱)

- 옛 앱 네이티브 코드에는 멘토링/클리닉 기능이 없음 (웹서버에서 처리)
- 스케줄/캘린더 UI 패턴은 기존 `student_absence_schedules` 구현 참조
- 예약 시스템 패턴: slot + application + status workflow

---

## 10. Phase 8: 멘토링 스케줄 관리 (관리자)

> 견적서 8번 | 12~14주차 | 7.2일

### 10.1 목표

관리자가 멘토를 등록하고, 멘토링/클리닉 슬롯을 관리하며, 신청을 확정/거절한다.

### 10.2 작업 목록

#### 10.2.1 멘토 관리

- 멘토 등록 폼: 이름, 과목, 소개, 프로필 이미지
- 멘토 목록: 활성/비활성 필터
- 멘토 수정/비활성화

#### 10.2.2 슬롯 등록

- 슬롯 등록 폼: 멘토 선택, 날짜, 시간대, 과목, 유형(멘토링/클리닉), 정원, 장소, 비고
- 벌크 등록: 반복 등록 (매주 같은 시간대로 N주간 생성)
- 슬롯 수정/삭제 (신청자 없을 때만 삭제)

#### 10.2.3 주간 캘린더 뷰

- 주간 타임테이블 형태 (월~일, 시간대별 그리드)
- 슬롯별: 멘토명, 과목, 신청인원/정원 표시
- 색상 구분: 유형별 (멘토링=파랑, 클리닉=초록), 상태별 (여석 있음/마감)
- 슬롯 클릭 → 신청자 목록 + 확정/거절 액션

#### 10.2.4 신청 확정/거절

- 대기중(`pending`) 신청 목록
- 확정 버튼 → `status: confirmed`, `confirmed_at` 기록
- 거절 버튼 → 거절 사유 입력, `status: rejected`, `rejected_at` 기록
- 확정/거절 시:
  - 학생/학부모에게 푸시 알림 발송
  - 카카오 알림톡 발송 (기존 NCloud SENS 활용, 멘토링 전용 템플릿 추가)

#### 10.2.5 신청 내역 관리

- 날짜 범위 필터
- 학생별 필터
- 상태별 필터 (전체/대기/확정/거절/취소)
- 관리자 강제 취소 (confirmed → cancelled)

### 10.3 UI 페이지 (관리자)

| 경로 | 기능 |
|------|------|
| `/admin/mentoring` | 주간 캘린더 뷰 (메인) |
| `/admin/mentoring/mentors` | 멘토 목록/등록/수정 |
| `/admin/mentoring/slots/new` | 슬롯 등록 |
| `/admin/mentoring/slots/{id}` | 슬롯 상세 + 신청자 목록 |
| `/admin/mentoring/applications` | 전체 신청 내역 |

### 10.4 Server Actions

- `createMentor(data)` — 멘토 등록
- `updateMentor(id, data)` — 멘토 수정
- `createMentoringSlot(data)` — 슬롯 등록
- `createMentoringSlotsBulk(data)` — 벌크 등록
- `updateMentoringSlot(id, data)` — 슬롯 수정
- `deleteMentoringSlot(id)` — 슬롯 삭제
- `confirmMentoringApplication(appId)` — 확정
- `rejectMentoringApplication(appId, reason)` — 거절
- `adminCancelMentoringApplication(appId, reason)` — 관리자 강제 취소
- `getAdminMentoringApplications(filters)` — 관리자용 신청 목록

### 10.5 알림톡 템플릿 (NCloud SENS)

기존 `src/lib/ncloud/alimtalk.ts`에 멘토링 전용 템플릿 추가:

| 템플릿 | 수신자 | 내용 |
|--------|--------|------|
| `mentoring_confirmed` | 학부모 | "{학생명}님의 {과목} 멘토링이 확정되었습니다. 일시: {날짜} {시간}" |
| `mentoring_rejected` | 학부모 | "{학생명}님의 {과목} 멘토링 신청이 거절되었습니다. 사유: {사유}" |
| `mentoring_cancelled` | 학부모 | "{학생명}님의 {과목} 멘토링이 취소되었습니다." |
| `mentoring_reminder` | 학부모 | "{학생명}님의 {과목} 멘토링이 내일입니다. 일시: {날짜} {시간}" |

---

## 11. DB 스키마 변경 총괄

### 11.1 기존 테이블 (변경 없음)

`profiles`, `student_profiles`, `parent_profiles`, `parent_student_links`, `branches`,
`student_types`, `student_type_subjects`, `date_type_definitions`, `date_assignments`,
`period_definitions`, `attendance`, `study_goals`, `subjects`, `focus_scores`, `points`,
`schedules`, `student_absence_schedules`, `chat_rooms`, `notifications`,
`student_notifications`, `user_notifications`, `caps_sync_log`, `announcements`,
`announcement_reads`, `weekly_goal_settings`, `weekly_point_history`,
`focus_score_presets`, `penalty_presets`, `reward_presets`

### 11.2 기존 테이블 (컬럼 추가)

| 테이블 | 추가 컬럼 | Phase |
|--------|----------|-------|
| `chat_messages` | `file_url text`, `file_name text`, `file_type text` | 4 |

### 11.3 신규 테이블

| 테이블 | 용도 | Phase |
|--------|------|-------|
| `push_tokens` | 푸시 토큰 관리 | 2 |
| `announcement_attachments` | 공지사항 첨부파일 | 4 |
| `meal_products` | 급식 상품 | 5 |
| `meal_menus` | 일별 급식 메뉴 | 5 |
| `meal_orders` | 급식 주문 | 5 |
| `payment_logs` | 결제 로그 (공용) | 5 |
| `mentors` | 멘토(선생님) | 7 |
| `mentoring_slots` | 멘토링 슬롯 | 7 |
| `mentoring_applications` | 멘토링 신청 | 7 |

### 11.4 신규 ENUM 타입

| 타입 | 값 | Phase |
|------|-----|-------|
| `mentoring_type` | `mentoring`, `clinic` | 7 |
| `application_status` | `pending`, `confirmed`, `rejected`, `cancelled` | 7 |

### 11.5 Supabase Storage 버킷 (신규)

| 버킷 | 용도 | Phase |
|------|------|-------|
| `chat-files` | 채팅 첨부파일 | 4 |
| `announcement-files` | 공지사항 첨부파일 | 4 |

### 11.6 RLS 정책 개요

모든 신규 테이블에 RLS를 활성화한다. 주요 정책:

- `push_tokens`: 본인 토큰만 INSERT/DELETE, admin은 SELECT
- `meal_products`: 모든 인증 사용자 SELECT, admin만 INSERT/UPDATE
- `meal_orders`: 본인 주문만 SELECT/INSERT, admin은 전체
- `mentors`: 모든 인증 사용자 SELECT, admin만 INSERT/UPDATE
- `mentoring_slots`: 모든 인증 사용자 SELECT, admin만 INSERT/UPDATE/DELETE
- `mentoring_applications`: 본인 신청만 SELECT/INSERT/UPDATE, admin은 전체

---

## 12. 외부 연동 상세

### 12.1 NICEPay (나이스페이먼츠)

| 항목 | 내용 |
|------|------|
| 모델 | Server 승인 (서버에서 최종 승인 호출) |
| JS SDK | `https://pay.nicepay.co.kr/v1/js/` |
| 인증 | Basic Auth: `Base64(clientId:secretKey)` |
| 결제 승인 | `POST /v1/payments/{tid}` |
| 취소/환불 | `POST /v1/payments/{tid}/cancel` |
| 망취소 | `POST /v1/payments/netcancel` |
| 거래 조회 | `GET /v1/payments/{tid}` |
| 웹훅 | `POST /api/payments/nicepay/webhook` 등록 |
| 타임아웃 | Connection 5초, Read 30초 |
| 샌드박스 | `sandbox-api.nicepay.co.kr` / `sandbox-pay.nicepay.co.kr` |

사전 준비 (클라이언트):
1. [나이스페이 회원가입](https://start.nicepay.co.kr/merchant/login/main.do)
2. 사업자등록증 제출 → 심사 → 클라이언트 키 / 시크릿 키 발급
3. 웹훅 URL 등록

### 12.2 FCM / APNs (Expo Push)

| 항목 | 내용 |
|------|------|
| 서비스 | Expo Push Notification Service |
| Android | Firebase 프로젝트 생성 → `google-services.json` → FCM 서버 키 |
| iOS | Apple Developer → Push Notification 인증서 (.p8) → Expo 대시보드 업로드 |
| 발송 API | `POST https://exp.host/--/api/v2/push/send` |
| 배치 | 최대 100건/요청 |
| 토큰 형식 | `ExponentPushToken[xxxxx]` |

### 12.3 NCloud SENS (카카오 알림톡)

| 항목 | 내용 |
|------|------|
| 현재 | 출결/상벌점 알림톡 발송 중 (`src/lib/ncloud/alimtalk.ts`) |
| 추가 | 멘토링 확정/거절/취소/리마인더 템플릿 등록 |
| 카카오 채널 | 기존 채널 활용 |
| 템플릿 심사 | 카카오 비즈니스에서 등록 → 심사 (1~3 영업일) |

---

## 13. 앱 스토어 배포 체크리스트

### 13.1 Apple App Store

- [ ] Apple Developer 계정 (클라이언트 명의, 연 $99)
- [ ] App Store Connect 앱 등록
- [ ] 앱 이름, 설명, 키워드, 스크린샷, 개인정보처리방침 URL
- [ ] Push Notification 인증서 (.p8)
- [ ] 앱 심사 제출 (통상 1~5 영업일, 리젝 대응 포함)

### 13.2 Google Play

- [ ] Google Play Developer 계정 (클라이언트 명의, 1회 $25)
- [ ] Google Play Console 앱 등록
- [ ] Firebase 프로젝트 + `google-services.json`
- [ ] 앱 이름, 설명, 스크린샷, 개인정보처리방침 URL
- [ ] 비공개 테스트 → 프로덕션 출시

### 13.3 EAS Build 설정

```json
// eas.json (예시 — 프로젝트 실제 값과 다를 수 있음)
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "preview-simulator": {
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "...", "ascAppId": "...", "appleTeamId": "..." },
      "android": { "serviceAccountKeyPath": "./play-store-key.json" }
    }
  }
}
```

- **클라이언트 스토어 계정 전**: `preview-simulator`처럼 `ios.simulator: true` 프로필을 두고 `eas build --profile preview-simulator --platform ios`로 시뮬레이터용 아티팩트만 검증할 수 있다(로컬 `expo run:ios`와 병행).
- **계정 확보 후**: `preview`/`production`에서 `simulator: false`로 실기기·스토어 제출용 빌드를 진행한다.

---

## 14. 기술적 고려사항

### 14.1 Expo 프로젝트 위치

두 가지 옵션:

| 옵션 | 구조 | 장단점 |
|------|------|--------|
| A. 서브디렉터리 (현재) | `studycafe/` 레포 안에 `studycafe-app/` | 단순, 웹·앱 동시 클론 |
| B. 모노레포 | `studycafe/packages/web/` + `studycafe/packages/app/` | 공유 코드 가능, 복잡 |

**권장: 옵션 A** — 앱은 WebView 쉘이므로 공유 코드가 적고, 별도 관리가 간단함.

### 14.2 WebView 성능

- 초기 로딩: 스플래시 → WebView 로딩 완료 감지 (`onLoadEnd`) → 스플래시 숨김
- 오프라인: 네트워크 없을 때 오프라인 안내 화면 표시
- 캐시: WebView 캐시 활용 + Service Worker (기존 PWA)

### 14.3 보안

- SecureStore: OS 키체인/키스토어 활용 (앱 삭제 시 자동 제거)
- NICEPay 시크릿 키: 서버 환경변수에만 저장 (클라이언트 노출 금지)
- API Routes 인증: Supabase 세션 검증 + CORS 제한
- 결제 위변조 검증: signature 비교 필수

### 14.4 에러 처리

- NICEPay 결제: 승인 timeout → 망취소 자동 실행
- 푸시 발송 실패: 에러 로깅, 재시도 없음 (Expo Push가 자체 재시도)
- WebView 로딩 실패: 재시도 버튼 표시

---

## 부록: 파일 구조 예상 (신규/변경)

### Next.js 웹 (기존 프로젝트에 추가)

```
src/
├── app/
│   ├── student/
│   │   ├── meals/                    # [신규] 급식
│   │   │   ├── page.tsx             # 급식 목록
│   │   │   ├── [productId]/page.tsx # 급식 상세
│   │   │   ├── pay/[orderId]/page.tsx # 결제 페이지
│   │   │   ├── pay/result/page.tsx  # 결제 결과
│   │   │   └── orders/page.tsx      # 신청 내역
│   │   └── mentoring/                # [신규] 멘토링
│   │       ├── page.tsx             # 캘린더 + 슬롯
│   │       ├── [slotId]/apply/page.tsx # 신청 폼
│   │       └── my/page.tsx          # 내 신청 내역
│   ├── parent/
│   │   ├── meals/                    # [신규] 학부모 급식
│   │   └── mentoring/                # [신규] 학부모 멘토링
│   ├── admin/
│   │   ├── meals/                    # [신규] 급식 관리
│   │   │   ├── page.tsx             # 상품 목록
│   │   │   ├── new/page.tsx         # 상품 등록
│   │   │   └── [id]/               # 상품 상세/메뉴/주문
│   │   └── mentoring/                # [신규] 멘토링 관리
│   │       ├── page.tsx             # 주간 캘린더
│   │       ├── mentors/page.tsx     # 멘토 관리
│   │       ├── slots/new/page.tsx   # 슬롯 등록
│   │       └── applications/page.tsx # 신청 내역
│   └── api/
│       ├── push/                     # [신규] 푸시 API
│       │   ├── register/route.ts
│       │   └── unregister/route.ts
│       └── payments/                 # [신규] 결제 API
│           └── nicepay/
│               ├── confirm/route.ts # 승인
│               ├── cancel/route.ts  # 취소
│               ├── webhook/route.ts # 웹훅
│               └── netcancel/route.ts # 망취소
├── lib/
│   ├── actions/
│   │   ├── meal.ts                   # [신규] 급식 서버 액션
│   │   └── mentoring.ts             # [신규] 멘토링 서버 액션
│   ├── push.ts                       # [신규] 푸시 발송 유틸
│   └── nicepay.ts                    # [신규] NICEPay API 클라이언트
├── components/
│   ├── student/
│   │   ├── meals/                    # [신규] 급식 컴포넌트
│   │   └── mentoring/                # [신규] 멘토링 컴포넌트
│   ├── parent/
│   │   ├── meals/                    # [신규]
│   │   └── mentoring/                # [신규]
│   └── admin/
│       ├── meals/                    # [신규]
│       └── mentoring/                # [신규]
└── types/
    └── database.ts                   # [변경] 신규 테이블 타입 추가
```

### Expo 앱 (`studycafe/studycafe-app/`)

```
studycafe-app/
├── app.json
├── eas.json
├── package.json
├── App.tsx                           # 메인 진입점
├── src/
│   ├── WebViewScreen.tsx             # WebView + postMessage 핸들러
│   ├── SplashLoader.tsx              # 세션 복원 + 스플래시
│   ├── hooks/
│   │   ├── useAuth.ts                # SecureStore 토큰 관리
│   │   ├── usePushNotifications.ts   # 토큰 발급 + 수신 처리
│   │   └── useDeepLink.ts           # 딥링크 수신
│   ├── utils/
│   │   ├── bridge.ts                 # postMessage 프로토콜
│   │   ├── schemes.ts                # 카드사 앱 scheme 목록
│   │   └── supabase.ts              # Native Supabase 클라이언트
│   └── constants.ts                  # 웹 URL, scheme 등
├── assets/
│   ├── icon.png
│   ├── splash.png
│   └── adaptive-icon.png
├── google-services.json              # FCM
└── ios/
    └── GoogleService-Info.plist      # FCM (iOS)
```
