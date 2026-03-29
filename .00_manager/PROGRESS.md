# 개발 진행현황

> **이 문서는 매 개발 세션이 끝날 때마다 갱신한다.**
> 완료된 항목은 `[x]`로 체크하고, 현재 작업 중인 항목에는 `[~]`를 표시한다.
> 상세 스펙은 ROADMAP.md를 참고한다.

---

## 현재 상태

| 항목 | 값 |
|------|-----|
| 현재 Phase | Phase 1 — 앱 쉘 구성 |
| 마지막 업데이트 | 2026-03-24 |
| 다음 작업 | Phase 2 — 푸시 알림(`push_tokens`, `expo-notifications`, 등록 API). EAS iOS 시뮬레이터 빌드는 Expo 대시보드에서 완료 여부 확인(무료 큐 대기 가능) |

---

## Phase 1: 앱 쉘 구성 (1~2주차)

### Expo 프로젝트 초기 구성
- [x] Expo 프로젝트 생성 (`studycafe/studycafe-app/`, 웹과 단일 레포)
- [x] 주요 의존성 설치 (react-native-webview, expo-linking, expo-constants)
- [x] app.json 설정 (bundleIdentifier, package, scheme)

### WebView 연동
- [x] react-native-webview로 Next.js 웹 임베드
- [x] User-Agent에 `WeberStudyApp/1.0` 추가
- [x] postMessage 통신 기반 구축 (프로토콜 정의)
- [x] 쿠키/localStorage 영속성 설정
- [x] Android 백버튼 핸들링
- [x] 웹 측 `isNativeApp()` 유틸 추가

### 앱 아이콘 / 스플래시
- [x] 앱 아이콘 설정 (`studycafe-app/assets/icon.png` + `app.json` icon)
- [x] 스플래시 스크린 설정 (`expo-splash-screen`, 첫 `WebView` `onLoadEnd`에서 숨김)
- [x] Android adaptive icon (`app.json` adaptiveIcon)

### 딥링크
- [x] URL scheme 등록 (`weberstudy://`)
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
- [ ] `push_tokens` 테이블 생성 + RLS
- [ ] 푸시 토큰 등록 API (`POST /api/push/register`)
- [ ] 푸시 토큰 해제 API (`DELETE /api/push/unregister`)
- [ ] 푸시 발송 유틸 (`src/lib/push.ts`)

### Native 측
- [ ] expo-notifications 설정
- [ ] FCM 서버 키 등록 (Android)
- [ ] APNs 인증서 등록 (iOS)
- [ ] 앱 시작 시 푸시 권한 요청 + 토큰 발급
- [ ] 토큰을 postMessage로 Web에 전달 → 서버 등록
- [ ] 포그라운드 알림 표시
- [ ] 알림 탭 → 딥링크 처리

### 트리거별 발송 연동
- [ ] 공지사항 등록 → 지점 전체 푸시
- [ ] 채팅 메시지 → 상대방 푸시
- [ ] 기존 알림 시스템(student_notifications/user_notifications)과 연동

---

## Phase 3: 자동 로그인 / 세션 관리 (4~5주차)

### 토큰 저장 / 복원
- [ ] expo-secure-store 연동
- [ ] 로그인 성공 시 refresh_token 저장 (Web → Native)
- [ ] 로그아웃 시 토큰 삭제 + 푸시 해제
- [ ] 앱 시작 시 토큰 복원 → Supabase session refresh

### WebView 세션 주입
- [ ] injectedJavaScript로 Supabase 세션 복원
- [ ] Web → Native 토큰 동기화 (onAuthStateChange)

### 비밀번호 재설정
- [ ] 6자리 코드 방식 구현
- [ ] 이메일 발송 → 코드 검증 → 비밀번호 변경

---

## Phase 4: 파일/사진 첨부 (5~7주차)

### DB / Storage
- [ ] chat_messages에 file_url, file_name, file_type 컬럼 추가
- [ ] announcement_attachments 테이블 생성
- [ ] Supabase Storage 버킷 생성 (chat-files, announcement-files)

### Native 측
- [ ] expo-image-picker (카메라/갤러리)
- [ ] expo-document-picker (파일)
- [ ] Native에서 Supabase Storage 직접 업로드
- [ ] 업로드 완료 → postMessage로 URL 전달

### 웹 측 (채팅)
- [ ] 파일 첨부 버튼 추가 (앱: postMessage, 웹: input[file])
- [ ] 이미지 메시지 렌더링 (썸네일 + 확대)
- [ ] 파일 메시지 렌더링 (파일명 + 다운로드)

### 웹 측 (공지사항)
- [ ] 관리자: 파일 첨부 UI
- [ ] 첨부파일 목록 표시 + 다운로드

---

## Phase 5: 급식 신청/결제 — 학생/학부모 (7~9주차)

### DB
- [ ] meal_products 테이블 생성 + RLS
- [ ] meal_menus 테이블 생성 + RLS
- [ ] meal_orders 테이블 생성 + RLS
- [ ] payment_logs 테이블 생성 + RLS

### NICEPay 연동
- [ ] 환경변수 설정 (clientId, secretKey, returnUrl)
- [ ] NICEPay API 클라이언트 (`src/lib/nicepay.ts`)
- [ ] 결제 승인 API (`/api/payments/nicepay/confirm`)
- [ ] 결제 취소 API (`/api/payments/nicepay/cancel`)
- [ ] 웹훅 수신 API (`/api/payments/nicepay/webhook`)
- [ ] 망취소 API (`/api/payments/nicepay/netcancel`)
- [ ] 위변조 검증 (signature)
- [ ] 샌드박스 테스트

### Native (결제 앱 scheme)
- [ ] WebView onShouldStartLoadWithRequest에서 카드사 앱 scheme 감지
- [ ] Linking.openURL()로 외부 앱 호출
- [ ] 인증 완료 후 앱 복귀 처리

### 서버 액션
- [ ] getMealProducts(branchId)
- [ ] getMealMenus(productId)
- [ ] createMealOrder(productId, studentId)
- [ ] cancelMealOrder(orderId) — 날짜 검증 포함
- [ ] getMealOrders(userId)

### UI (학생)
- [ ] `/student/meals` — 급식 목록 페이지
- [ ] `/student/meals/{productId}` — 급식 상세 + 결제 버튼
- [ ] `/student/meals/pay/{orderId}` — 결제 진행 (NICEPay JS SDK)
- [ ] `/student/meals/pay/result` — 결제 결과
- [ ] `/student/meals/orders` — 신청 내역

### UI (학부모)
- [ ] `/parent/meals` — 급식 목록 (자녀 선택)
- [ ] `/parent/meals/{productId}` — 급식 상세
- [ ] `/parent/meals/orders` — 신청 내역

### BottomNav 변경
- [ ] 학생/학부모 하단 네비게이션에 급식 메뉴 추가

---

## Phase 6: 급식 관리 — 관리자 (9~10주차)

### 서버 액션
- [ ] createMealProduct(data)
- [ ] updateMealProduct(id, data)
- [ ] upsertMealMenu(productId, date, menuText)
- [ ] getMealOrdersForAdmin(productId, date?)
- [ ] adminCancelMealOrder(orderId, reason)

### UI
- [ ] `/admin/meals` — 상품 목록
- [ ] `/admin/meals/new` — 상품 등록 폼
- [ ] `/admin/meals/{id}` — 상품 상세/수정
- [ ] `/admin/meals/{id}/menus` — 메뉴 입력/수정 (캘린더 형태)
- [ ] `/admin/meals/{id}/orders` — 신청 현황 + Excel 다운로드
- [ ] 관리자 상시 취소/환불 처리

---

## Phase 7: 멘토링/클리닉 신청 — 학생/학부모 (10~12주차)

### DB
- [ ] mentors 테이블 생성 + RLS
- [ ] mentoring_slots 테이블 생성 + RLS
- [ ] mentoring_applications 테이블 생성 + RLS
- [ ] mentoring_type, application_status ENUM 생성

### 서버 액션
- [ ] getMentoringSlots(branchId, date?, type?)
- [ ] getMentoringSlotDetail(slotId)
- [ ] applyMentoring(slotId, studentId, note?)
- [ ] cancelMentoringApplication(applicationId, reason)
- [ ] getMyMentoringApplications(userId)

### UI (학생)
- [ ] `/student/mentoring` — 캘린더 + 슬롯 목록
- [ ] `/student/mentoring/{slotId}/apply` — 신청 폼
- [ ] `/student/mentoring/my` — 내 신청 내역 (상태별 탭)

### UI (학부모)
- [ ] `/parent/mentoring` — 캘린더 (자녀 선택)
- [ ] `/parent/mentoring/{slotId}/apply` — 신청 폼
- [ ] `/parent/mentoring/my` — 신청 내역

### 알림 연동
- [ ] 신청 시 관리자 알림
- [ ] 확정/거절 시 학생+학부모 푸시 + 알림톡

### BottomNav 변경
- [ ] 학생/학부모 하단 네비게이션에 멘토링 메뉴 추가

---

## Phase 8: 멘토링 스케줄 관리 — 관리자 (12~14주차)

### 서버 액션
- [ ] createMentor(data) / updateMentor(id, data)
- [ ] createMentoringSlot(data)
- [ ] createMentoringSlotsBulk(data) — 반복 등록
- [ ] updateMentoringSlot(id, data) / deleteMentoringSlot(id)
- [ ] confirmMentoringApplication(appId)
- [ ] rejectMentoringApplication(appId, reason)
- [ ] adminCancelMentoringApplication(appId, reason)
- [ ] getAdminMentoringApplications(filters)

### UI
- [ ] `/admin/mentoring` — 주간 캘린더 뷰
- [ ] `/admin/mentoring/mentors` — 멘토 목록/등록/수정
- [ ] `/admin/mentoring/slots/new` — 슬롯 등록 (벌크 포함)
- [ ] `/admin/mentoring/slots/{id}` — 슬롯 상세 + 신청자 목록
- [ ] `/admin/mentoring/applications` — 전체 신청 내역 (필터)

### 알림톡 템플릿
- [ ] NCloud SENS 멘토링 확정/거절/취소/리마인더 템플릿 등록
- [ ] 확정/거절 시 알림톡 + 푸시 동시 발송

---

## 통합 / QA / 배포

- [ ] 크로스 디바이스 QA (iOS + Android)
- [ ] 결제 운영 전환 (샌드박스 → 프로덕션)
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
