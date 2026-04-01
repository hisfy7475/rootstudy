# 개발 진행현황

> **이 문서는 매 개발 세션이 끝날 때마다 갱신한다.**
> 완료된 항목은 `[x]`로 체크하고, 현재 작업 중인 항목에는 `[~]`를 표시한다.
> 상세 스펙은 ROADMAP.md를 참고한다.

---

## 현재 상태

| 항목 | 값 |
|------|-----|
| 현재 Phase | Phase 8 완료 — 관리자 멘토링 스케줄·확정/거절·알림톡(환경변수) |
| 마지막 업데이트 | 2026-04-01 |
| 다음 작업 | ① NICEPay v3 MID/MerchantKey·`NEXT_PUBLIC_SITE_URL` 실제 도메인 ② 멘토링 알림톡 카카오 템플릿 심사·환경변수 실값 ③ 로컬 `supabase db pull`(선택) |

---

## Phase 1: 앱 쉘 구성 (1~2주차)

### Expo 프로젝트 초기 구성
- [x] Expo 프로젝트 생성 (`studycafe/studycafe-app/`, 웹과 단일 레포)
- [x] 주요 의존성 설치 (react-native-webview, expo-linking, expo-constants)
- [x] app.json 설정 (bundleIdentifier, package, scheme)

### WebView 연동
- [x] react-native-webview로 Next.js 웹 임베드
- [x] User-Agent에 `RootStudyApp/1.0` 추가
- [x] postMessage 통신 기반 구축 (프로토콜 정의)
- [x] 쿠키/localStorage 영속성 설정
- [x] Android 백버튼 핸들링
- [x] 웹 측 `isNativeApp()` 유틸 추가

### 앱 아이콘 / 스플래시
- [x] 앱 아이콘 설정 (`studycafe-app/assets/icon.png` + `app.json` icon)
- [x] 스플래시 스크린 설정 (`expo-splash-screen`, 첫 `WebView` `onLoadEnd`에서 숨김)
- [x] Android adaptive icon (`app.json` adaptiveIcon)

### 딥링크
- [x] URL scheme 등록 (`rootstudy://`)
- [x] Universal Links / App Links 설정 (`app.json` associatedDomains·intentFilters + 웹 `public/.well-known/*`; 실값 치환은 클라이언트 계정·서명 확정 후)
- [x] 딥링크 → WebView URL 매핑 (`src/utils/deepLink.ts`, `WebViewScreen`)

### EAS Build / 배포
- [x] eas.json 설정 (dev/preview/production + `preview-simulator` — iOS 시뮬레이터용 스모크)
- [x] 로컬 시뮬레이터/에뮬레이터 네이티브 빌드 스모크 — 루트 `npm run app:verify:ios-sim` / `app:verify:android`(내부적으로 `expo prebuild` + Xcode `iphonesimulator` / Gradle `assembleDebug`). 일상 실행은 `npm run app:ios`·`app:android`(`expo run:*`). 참고: 로컬에 Apple 코드서명이 없으면 `expo run:ios`가 실패할 수 있어 검증은 위 스크립트로 대체 가능
- [x] `npx expo-doctor` 통과, `react-native-webview`를 Expo SDK 권장 버전(13.16.0)으로 고정
- [x] EAS 프로젝트 연동 (`eas init`, `app.json`의 `extra.eas.projectId`, `owner`) 및 iOS 시뮬레이터 프로파일 빌드 **제출** (`591896cb-706f-4d7b-b937-2cddabccd16c` — [로그](https://expo.dev/accounts/mt.bluupill/projects/studycafe-app/builds/591896cb-706f-4d7b-b937-2cddabccd16c); 무료 플랜 큐에서 대기·완료는 대시보드에서 확인)
- [ ] **보류 — 클라이언트 계정 후** 실기기 EAS 빌드 (`preview`), Android 실기기 스토어용 스모크
- [ ] **보류 — 클라이언트 계정 후** App Store Connect / Google Play Console 앱 등록
- [ ] **보류 — 클라이언트 계정 후** AASA·`assetlinks.json` 플레이스홀더 실값 반영 및 도메인 검증

---

## Phase 2: 푸시 알림 시스템 (2~4주차)

### DB / 서버
- [x] `push_tokens` 테이블 생성 + RLS
- [x] 푸시 토큰 등록 API (`POST /api/push/register`)
- [x] 푸시 토큰 해제 API (`DELETE /api/push/unregister`)
- [x] 푸시 발송 유틸 (`src/lib/push.ts`, Expo Push API fetch)

### Native 측
- [x] expo-notifications 설정 (`app.json` 플러그인, `expo-notifications`·`expo-device`)
- [ ] **보류 — 클라이언트 계정 후** FCM 서버 키 등록 (Android)
- [ ] **보류 — 클라이언트 계정 후** APNs 인증서 등록 (iOS)
- [x] 앱 시작 시 푸시 권한 요청 + 토큰 발급 (`usePushNotifications`)
- [x] 토큰을 injectJavaScript·`message` 이벤트로 Web에 전달 → `PushTokenListener`가 `/api/push/register`
- [x] 포그라운드 알림 표시 (`setNotificationHandler`)
- [x] 알림 탭 → `data.path` 기준 WebView URL (`usePushNotifications`)

### 트리거별 발송 연동
- [x] 공지/채팅 등 기존 경로 — `createStudentNotification` / `createUserNotification` / `createBulkStudentNotifications` 성공 시 푸시 발송(`link`가 `/`로 시작할 때 딥링크 `data.path`로 전달)
- [x] 기존 알림 시스템(`student_notifications` / `user_notifications`)과 연동

---

## Phase 3: 자동 로그인 / 세션 관리 (4~5주차)

### 토큰 저장 / 복원
- [x] expo-secure-store 연동 (`studycafe-app`, `useSecureTokenStore.ts`)
- [x] 로그인 성공 시 access/refresh 저장 (`AuthBridge` → `LOGIN_SUCCESS` → `WebViewScreen`)
- [x] 로그아웃 시 SecureStore 삭제 (`SignOutForm` / `signOutWithNativeSync` → `LOGOUT`)
- [x] 로그아웃 시 `/api/push/unregister` 연동 (`sessionStorage` 토큰 + `signOutWithNativeSync`)
- [x] 앱 시작 시 로그인 화면이면 SecureStore → `SESSION_INJECT` → `setSession` → `returnPath`(딥링크) 또는 `/` 리다이렉트

### WebView 세션 주입
- [x] `injectJavaScript`로 `SESSION_INJECT` 디스패치 (`WebViewScreen` + `buildInjectNativeMessageScript`)
- [x] Web → Native 토큰 동기화 (`AuthBridge` / `onAuthStateChange`)

### 비밀번호 재설정
- [x] 6자리 코드 방식 (`verifyOtp` recovery, `forgot-password/page.tsx`)
- [x] 이메일 발송 → 코드 검증 → 비밀번호 변경 (`actions.ts`)

---

## Phase 4: 파일/사진 첨부 (5~7주차)

### DB / Storage
- [x] chat_messages에 file_url, file_name, file_type 컬럼 추가 (마이그레이션 SQL 준비)
- [x] announcement_attachments 테이블 생성 + RLS (마이그레이션 SQL 준비)
- [x] Supabase Storage 버킷·정책 (chat-files, announcement-files — 마이그레이션 SQL 준비)

### Native 측
- [x] expo-image-picker (갤러리·촬영; 채팅은 갤러리 1차, `EXPO_PUBLIC_SUPABASE_*` 필요)
- [x] expo-document-picker (파일)
- [x] Native에서 Supabase Storage 직접 업로드 (`nativeChatUpload.ts`)
- [x] 업로드 완료 → `FILE_UPLOADED` 주입 → 채팅에서 이미지/파일 메시지 전송 (`chat-room` / `WebViewScreen`)

### 웹 측 (채팅)
- [x] 파일 첨부 버튼 (웹: input; 앱: `PICK_FILE` postMessage) + `uploadChatFile` / `sendMessage` 확장
- [x] 이미지 메시지 (기존 썸네일 + 확대, 10MB로 상향)
- [x] 파일 메시지 렌더링 (파일명 + 새 탭 링크)

### 웹 측 (공지사항)
- [x] 관리자: 파일 첨부 UI + `uploadAnnouncementAttachment` / 삭제
- [x] 학생·학부모: 상세에서 첨부 목록 + 다운로드 링크

### Storage 정리/보안
- [x] `deleteAnnouncementAttachment`에서 Storage 객체 함께 삭제
- [ ] 공개 버킷 정책 재검토 (signed URL 또는 비공개 전환 검토)

### Phase 4 병행: 앱 품질 보강
- [x] Safe Area 적용 — `viewport-fit: cover`, 헤더·탭·사이드바 모바일 토글
- [x] KST 타임존 규칙 준수 — 채팅·공지 표시 `timeZone: 'Asia/Seoul'`
- [x] WebView 로딩 실패 대응 — `onError` + 재시도
- [x] SESSION_INJECT 딥링크 복귀 — `returnPath` payload + `AuthBridge`
- [x] 채팅 스크롤 수정 — prepend 시 위치 보존, 신규 메시지 시에만 하단 스크롤
- [x] Realtime 에러/재연결 — 배너 + 최대 3회 지수 백오프 재구독
- [x] 마이그레이션 파일 정비 — `supabase/migrations/20260331110000_push_tokens.sql` 추가(원격 DB 적용은 별도)
- [x] pending 페이지 네비 정리 — `student/(shell)/`와 분리, 승인 대기 화면은 헤더·하단 탭 비표시
- [x] 학생 헤더 `seatNumber` 표시

---

## Phase 5: 급식 신청/결제 — 학생/학부모 (7~9주차)

### DB
- [x] meal_products 테이블 생성 + RLS (`supabase/migrations/20260401000000_phase5_meals.sql`)
- [x] meal_menus 테이블 생성 + RLS
- [x] meal_orders 테이블 생성 + RLS (+ pending 주문 본인 DELETE)
- [x] payment_logs 테이블 생성 + RLS

### NICEPay 연동 (PG Web v3, developers.nicepay.co.kr)
- [x] 환경변수 설정 가이드 (`.env.example` — `NEXT_PUBLIC_NICEPAY_MID`, `NICEPAY_MERCHANT_KEY`, `NEXT_PUBLIC_SITE_URL`)
- [x] NICEPay v3 클라이언트 (`src/lib/nicepay.ts` — SignData, 승인/취소/망취소 form-urlencoded)
- [x] 결제 승인 처리 (`POST /api/payments/nicepay/confirm` — TxTid/NextAppURL/NetCancelURL, 카드 `ResultCode=3001`)
- [x] 결제 취소 API (`POST /api/payments/nicepay/cancel` + `meal-payment-cancel.ts` → `pg-api` cancel_process.jsp, `2001`)
- [x] 웹훅 수신 API (`POST /api/payments/nicepay/webhook` — TID+MID+Amt 서명)
- [x] 망취소 API (`POST /api/payments/nicepay/netcancel` — v3 전문 필수, Bearer)
- [x] 결제창 `nicepay-pgweb.js` + `goPay` (`pay-client.tsx`, 서버에서 SignData 계산)
- [ ] 운영/테스트 MID로 E2E (공개 테스트 MID `nicepay00m` 가능, 당일 23:30 자동취소)

### Native (결제 앱 scheme)
- [x] WebView `onShouldStartLoadWithRequest` — `studycafe-app/src/utils/schemes.ts` + `WebViewScreen`
- [x] Linking.openURL()로 외부 앱 호출
- [x] 결제창 `appScheme: weberstudy://` (앱 복귀는 NICEPay·OS 동작에 따름)

### 서버 액션
- [x] `src/lib/actions/meal.ts` — 상품/메뉴/주문/취소·pending 삭제
- [x] 식사 2일 전 취소 데드라인 (`src/lib/meal-order-rules.ts`)

### UI (학생)
- [x] `/student/meals` — 급식 목록
- [x] `/student/meals/{productId}` — 상세 + 결제하기
- [x] `/student/meals/pay/{orderId}` — NICEPay JS SDK
- [x] `/student/meals/pay/result` — 결과
- [x] `/student/meals/orders` — 신청 내역
- [x] `/student/more` — 기존 탭 이전(스케줄·통계 등)

### UI (학부모)
- [x] `/parent/meals` — 자녀 선택 + 목록
- [x] `/parent/meals/{productId}?for=` — 급식 상세
- [x] `/parent/meals/pay/{orderId}`, `/parent/meals/pay/result`, `/parent/meals/orders`
- [x] `/parent/more` — 스케줄·리포트 등

### BottomNav 변경
- [x] 학생/학부모: 홈 · 급식 · 채팅 · 더보기

---

## Phase 6: 급식 관리 — 관리자 (9~10주차)

### 서버 액션
- [x] createMealProduct(data) — `src/lib/actions/meal.ts`
- [x] updateMealProduct(id, data)
- [x] upsertMealMenu(productId, date, menuText) + deleteMealMenu
- [x] getMealProductsForAdmin · getMealOrdersForAdmin(productId, status 필터)
- [x] adminCancelMealOrder(orderId, reason) — `executeAdminMealOrderCancel` 연동

### UI
- [x] `/admin/meals` — 상품 목록
- [x] `/admin/meals/new` — 상품 등록 폼
- [x] `/admin/meals/{id}` — 상품 상세/수정
- [x] `/admin/meals/{id}/menus` — 식사 기간 일자별 메뉴 입력/저장/삭제
- [x] `/admin/meals/{id}/orders` — 신청 현황 + Excel 다운로드
- [x] 관리자 상시 취소/환불 처리

---

## Phase 7: 멘토링/클리닉 신청 — 학생/학부모 (10~12주차)

### DB
- [x] mentors 테이블 생성 + RLS (`20260401100000_phase7_mentoring.sql`)
- [x] mentoring_slots 테이블 생성 + RLS (+ booked_count 트리거)
- [x] mentoring_applications 테이블 생성 + RLS
- [x] 유형·상태는 **text + CHECK** (기존 급식 패턴과 동일, 별도 PG ENUM 없음)

### 서버 액션
- [x] getMentoringSlotsForRange(from, to) + 월 캘린더용
- [x] getMentoringSlotDetail(slotId)
- [x] applyMentoring(slotId, studentId, note?)
- [x] cancelMentoringApplication(applicationId, reason)
- [x] getMyMentoringApplications()

### UI (학생)
- [x] `/student/mentoring` — 캘린더 + 슬롯 목록
- [x] `/student/mentoring/{slotId}/apply` — 신청 폼
- [x] `/student/mentoring/my` — 내 신청 내역 (상태별 탭)

### UI (학부모)
- [x] `/parent/mentoring` — 캘린더 (자녀 선택)
- [x] `/parent/mentoring/{slotId}/apply` — 신청 폼 (`?for=`)
- [x] `/parent/mentoring/my` — 신청 내역

### 알림 연동
- [x] 신청 시 관리자 알림 (`user_notifications` + 푸시, 링크 `/admin/mentoring`)
- [x] 확정/거절/관리자 취소 시 학생+학부모 앱 알림 + 푸시 + 알림톡(`sendMentoringAlimtalkToParent`, 템플릿 코드는 `.env`)

### BottomNav 변경
- [x] 학생/학부모 하단 네비게이션에 멘토링 탭 추가

---

## Phase 8: 멘토링 스케줄 관리 — 관리자 (12~14주차)

### 서버 액션
- [x] createMentor(data) / updateMentor(id, data)
- [x] createMentoringSlot(data)
- [x] createMentoringSlotsBulk(data) — 반복 등록
- [x] updateMentoringSlot(id, data) / deleteMentoringSlot(id)
- [x] confirmMentoringApplication(appId)
- [x] rejectMentoringApplication(appId, reason)
- [x] adminCancelMentoringApplication(appId, reason)
- [x] getAdminMentoringApplications(filters) + 조회 보조 함수들

### UI
- [x] `/admin/mentoring` — 주간 캘린더 뷰
- [x] `/admin/mentoring/mentors` — 멘토 목록/등록/수정
- [x] `/admin/mentoring/slots/new` — 슬롯 등록 (벌크 포함)
- [x] `/admin/mentoring/slots/{id}` — 슬롯 상세 + 신청자 목록
- [x] `/admin/mentoring/applications` — 전체 신청 내역 (필터)
- [x] 사이드바 `멘토링 관리` 메뉴

### 알림톡 템플릿
- [ ] **보류 — 카카오 비즈니스** NCloud SENS 멘토링 전용 템플릿 심사·등록 (`NCLOUD_KAKAO_MENTORING_*_TEMPLATE`)
- [x] 확정/거절/관리자 취소 시 학생·학부모 푸시 + 앱 내 알림 + 알림톡 발송 연동 (미설정/전화 없으면 스킵)

---

## 통합 / QA / 배포

- [ ] 크로스 디바이스 QA (iOS + Android)
- [ ] 결제 운영 검증 (PG v3 계약 MID·리턴 URL 화이트리스트)
- [ ] App Store 심사 제출
- [ ] Google Play 심사 제출
- [ ] 최종 안정화

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-23 | PROGRESS.md 초기 작성 |
| 2026-03-23 | Phase 1 1차 스프린트: Expo 프로젝트 생성, WebView 연동, isNativeApp() 유틸 추가 |
| 2026-03-23 | Phase 1 후속: `studycafe-app` 레포 통합, 스플래시·딥링크·`.well-known`·`eas.json`, 루트 `npm run app*` 스크립트 |
| 2026-03-23 | ROADMAP/PROGRESS: 클라이언트 스토어 계정 전에는 본인 Expo·시뮬레이터 우선; `eas.json`에 `preview-simulator` 추가 |
| 2026-03-24 | Phase 1 시뮬 스모크: `app:verify:*` 스크립트, webview 버전 정렬, EAS `@mt.bluupill/studycafe-app` 연동·시뮬 빌드 제출, `ITSAppUsesNonExemptEncryption` 설정 |
| 2026-03-31 | Phase 2 1차: `push_tokens`+RLS, `/api/push/register|unregister`, `src/lib/push.ts`, 학생·학부모 `PushTokenListener`, `expo-notifications`·딥링크 탭, 알림 생성 시 푸시 연동. 미들웨어 `/api/push` 조기 통과 |
| 2026-03-31 | Phase 3 1차: `expo-secure-store`, `LOGIN_SUCCESS`/`LOGOUT`/`SESSION_INJECT` 연동, `AuthBridge`, `SignOutForm`·`signOutWithNativeSync`, 비밀번호 재설정 완료 반영 |
| 2026-03-31 | Phase 3 후속: 로그아웃 시 `sessionStorage` Expo 토큰으로 `/api/push/unregister`. Phase 4: `supabase/migrations/...phase4...sql`, 채팅·공지 첨부 웹 기능, `FILE_UPLOADED` 채팅 수신 훅 |
| 2026-03-31 | Phase 4 완료: `push_tokens` 마이그레이션 SQL, 네이티브 피커·Storage 업로드·`FILE_UPLOADED` 이미지/파일, 공지 첨부 Storage 삭제, Safe Area·KST·스크롤·Realtime 재연결·WebView `onError`·`SESSION_INJECT` `returnPath`, `student/(shell)`·pending 최소 레이아웃, 좌석 번호 표시, `studycafe-app/.env.example` |
| 2026-03-31 | Phase 5 1차(학생·학부모): `phase5_meals` 마이그레이션, `nicepay.ts`, 결제 API 4종, `meal` 서버 액션, 학생·학부모 급식·결제·내역 UI, 하단 네비 급식+더보기, WebView PG scheme, 루트 `.env.example` NICEPay 항목 |
| 2026-03-31 | Phase 6: 관리자 `getMealProductsForAdmin`·CRUD·메뉴 upsert/delete·주문 목록·`executeAdminMealOrderCancel`, `/admin/meals/*`·사이드바 급식 관리 |
| 2026-03-31 | Phase 7: `phase7_mentoring` 마이그레이션, `mentoring.ts` 서버 액션, 학생·학부모 멘토링·신청·내역 UI, 하단 네비 멘토링 탭, 신청 시 지점 관리자 알림+푸시 |
| 2026-04-01 | Phase 8: 관리자 멘토·슬롯 CRUD/벌크, 주간 캘린더·신청 목록 UI, 확정/거절/강제취소 시 학생+학부모 알림·푸시·`sendMentoringAlimtalkToParent`, `getMondayOfWeekKST`, `.env.example` 멘토링 템플릿 주석 |

