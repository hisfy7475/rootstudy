# 02. App Store Connect 입력값

> App Store Connect → My Apps → 루트스터디 → "App Information" / "1.0 Prepare for Submission" 화면에 그대로 복붙.
> 글자수는 Apple이 강제하는 한도. UTF-8 기준 한글 1자 = 1자.

---

## 1. App Information (영구 정보)


| 필드                   | 값                          | 비고             |
| -------------------- | -------------------------- | -------------- |
| Name (앱 이름)          | `루트스터디`                    | 30자 제한         |
| Subtitle (부제)        | `학습관리·출결·소통을 한 번에`         | 30자 제한         |
| Bundle ID            | `com.rootstudy.app`        |                |
| SKU                  | `rootstudy-ios-001`        | 콘솔 내부용 식별자, 임의 |
| Primary Language     | `Korean`                   |                |
| Category — Primary   | `Education`                |                |
| Category — Secondary | `Lifestyle` *(선택)*         |                |
| Content Rights       | "내 앱은 제3자 콘텐츠를 포함하지 않습니다." |                |


---

## 2. 가격 / 배포


| 필드           | 값                            |
| ------------ | ---------------------------- |
| Price        | Free (Tier 0)                |
| Availability | Korea, Republic of (대한민국 단일) |
| Pre-Orders   | 사용 안 함                       |


---

## 3. App Privacy

> "App Privacy" → "Get Started" → 아래 항목으로 자기신고.

### 3-1. 데이터 수집 여부

**Yes, we collect data from this app.**

### 3-2. 수집 항목 / 사용처 / 추적 여부


| 데이터 카테고리     | 구체 항목                                              | 사용 목적                                 | 사용자와 연결 | 추적(Tracking) 사용 |
| ------------ | -------------------------------------------------- | ------------------------------------- | ------- | --------------- |
| Contact Info | Name, Email Address, Phone Number                  | App Functionality, Account Management | Yes     | No              |
| User Content | Photos or Videos, Other User Content (채팅 메시지·첨부파일) | App Functionality                     | Yes     | No              |
| Identifiers  | User ID                                            | App Functionality                     | Yes     | No              |
| Usage Data   | Product Interaction (학습 통계용 출석/체류 시간)              | App Functionality, Analytics          | Yes     | No              |
| Diagnostics  | Crash Data, Performance Data                       | App Functionality                     | No      | No              |


> ❌ Health, Financial Info, Location, Browsing History, Search History, Sensitive Info, Contacts, Purchases — **수집하지 않음**.
> 결제 정보는 NICEPay PG가 처리하고 앱은 결제 결과만 받음 → "Financial Info" 수집 아님.

---

## 4. Version Information (1.0 Prepare for Submission)

### 4-1. Promotional Text (170자, 심사 없이 언제든 변경 가능)

```
새 학기를 더 가볍게. 학습 출결, 학습 시간, 공지·채팅, 급식 신청까지 루트스터디 한 앱에서 관리하세요. 학생·학부모 모두를 위한 학습 동반자.
```

### 4-2. Description (4,000자)

```
루트스터디는 관리형 독서실 "WHEVER STUDY route"와 학생·학부모를 잇는 공식 학습 관리 앱입니다.

▣ 주요 기능

· 학습 출결 자동 기록
  독서실 출입 단말과 연동되어 등·하원 시간이 자동으로 기록됩니다.
  부모님은 자녀의 입실/퇴실, 학습 시간, 좌석 정보를 실시간으로 확인할 수 있습니다.

· 일별·주간 학습 통계
  하루 학습 시간, 부재 시간, 몰입도, 출결 패턴을 그래프로 한눈에 확인합니다.

· 공지·소통 채팅
  지점/담임/학부모와 1:1 채팅으로 소통하고, 사진·파일을 첨부해 자료를 공유할 수 있습니다.

· 푸시 알림
  공지 등록, 새 채팅, 결제 안내 등 중요 알림을 실시간으로 받습니다.

· 급식 신청·결제
  매월 급식 메뉴를 확인하고 직접 신청·결제할 수 있습니다.
  (결제는 안전한 PG 결제창을 통해 진행됩니다.)

· 멘토링·클리닉 신청
  필요한 과목의 멘토링/클리닉을 앱에서 신청하고 일정을 관리합니다.

· 자동 로그인 · 안전한 세션
  iOS 키체인을 사용해 로그인 정보를 안전하게 보관하며, 매번 로그인 없이 바로 학습 화면으로 진입합니다.

▣ 이런 분께 추천드립니다

· "오늘 우리 아이가 몇 시간 공부했지?"가 궁금한 학부모
· 등·하원 시간을 부모님께 일일이 알리기 번거로운 학생
· 지점/담임 선생님과 빠르게 소통하고 싶은 가족
· 매월 급식 신청·결제를 한 곳에서 끝내고 싶은 가족

▣ 안내

· 본 앱은 "WHEVER STUDY route" 회원 전용입니다. 회원 가입 후 지점에 등록되어야 출결·학습 데이터가 표시됩니다.
· 카메라/사진 권한은 채팅에 이미지를 첨부할 때만 사용되며, 백그라운드에서 임의로 접근하지 않습니다.
· 푸시 알림은 설정 > 알림에서 언제든 끌 수 있습니다.

▣ 문의 / 지원

이메일: support@rootstudy.co.kr
홈페이지: https://www.rootstudy.co.kr
```

### 4-3. Keywords (100자, 쉼표 구분)

```
학습관리,출석,학원,독서실,공부시간,학부모,학생,스터디카페,자기주도학습,입실,퇴실,급식
```

> 띄어쓰기 없음. Apple은 띄어쓰기를 글자수로 셈 → 콤마로만 구분이 효율적.

### 4-4. Support URL

```
https://www.rootstudy.co.kr
```

### 4-5. Marketing URL (선택)

```
https://www.rootstudy.co.kr
```

### 4-6. Privacy Policy URL (필수)

```
https://www.rootstudy.co.kr/privacy
```

### 4-7. Copyright

```
© 2026 RootStudy
```

### 4-8. Version / Build


| 필드      | 값                        |
| ------- | ------------------------ |
| Version | `1.0.0`                  |
| Build   | EAS production 빌드 산출물 자동 |


---

## 5. App Review Information (심사 메모 — 매우 중요)

### 5-1. Sign-In Information (필수)

심사관이 로그인해 모든 기능을 검증할 수 있도록 **운영 중인 데모 계정**을 제공.


| 필드               | 값                                          |
| ---------------- | ------------------------------------------ |
| Sign-in required | **Yes**                                    |
| User Name        | `applereview@rootstudy.co.kr` *(별도 생성 필요)* |
| Password         | `(별도 발급 — 클라이언트와 협의)`                      |


> ⚠️ 데모 계정에는 **출결 기록·채팅 메시지·급식 신청 이력**이 미리 들어 있어야 함. 빈 계정이면 거절 사유가 됨.

### 5-2. Contact Information


| 필드           | 값                         |
| ------------ | ------------------------- |
| First Name   | (담당자 성)                   |
| Last Name    | (담당자 이름)                  |
| Phone Number | (담당자 전화)                  |
| Email        | `support@rootstudy.co.kr` |


### 5-3. Notes (4,000자) — 심사 통과율을 좌우함, 그대로 복붙

```
본 앱은 한국의 관리형 독서실 "WHEVER STUDY route" 회원 전용 학습관리 앱입니다.

[1] 데모 계정
- ID: applereview@rootstudy.co.kr
- PW: (별도 전달)
- 본 계정에는 심사를 위해 출결, 채팅, 급식 신청, 통계가 미리 입력되어 있습니다.

[2] 카메라 / 사진 라이브러리 권한
- 채팅 화면에서 "사진 첨부" 버튼을 눌렀을 때만 권한을 요청합니다.
- 권한은 채팅 메시지에 이미지를 첨부하는 용도로만 사용되며, 사용자가 명시적으로 액션을 취하지 않으면 카메라/사진에 접근하지 않습니다.

[3] 외부 결제(NICEPay) 사용에 대한 설명
- "급식 신청" 메뉴에서 사용되는 결제는 한국의 PG사 NICEPay의 안전 결제창을 통해 처리됩니다.
- 결제 대상은 디지털 콘텐츠가 아닌 "실물 음식(독서실에서 제공되는 도시락/급식)"입니다.
- 따라서 Apple In-App Purchase 가이드라인 3.1.1(디지털 콘텐츠) 적용 대상이 아니며, 가이드라인 3.1.5(b)(실물 상품)에 해당합니다.
- 결제 과정에서 카드사 인증 앱(ISP, 삼성페이 등)으로 전환되는 scheme이 사용되며, 이는 한국 PG 결제 표준 방식입니다.

[4] 푸시 알림
- 공지 등록, 신규 채팅, 결제 안내 등 사용자에게 직접적으로 도움이 되는 정보만 전송합니다.
- 광고/마케팅 푸시는 발송하지 않습니다.

[5] 자녀 데이터 표시 (학부모 화면)
- 학부모 계정은 자녀와 가족 관계가 등록된 경우에만 자녀의 출결/학습/채팅 데이터에 접근할 수 있습니다.
- 가족 관계 등록은 관리자(지점장)에 의해서만 이루어지며, 임의로 다른 사용자의 데이터에 접근할 수 없습니다.

[6] 데이터 삭제 / 계정 탈퇴
- 앱 내 "설정 > 계정 삭제" 또는 https://www.rootstudy.co.kr/account-deletion 에서 삭제 요청이 가능합니다.

[7] 도메인
- 본 앱은 https://www.rootstudy.co.kr 의 모바일 화면을 WebView로 임베드한 하이브리드 앱입니다.
- 모든 통신은 HTTPS로 이루어집니다.

문의가 있으시면 support@rootstudy.co.kr 로 연락 부탁드립니다.
```

### 5-4. Attachment

- 화면 흐름이 복잡한 결제·학부모 자녀 연동 화면이 있으면 **데모 영상(MP4) 첨부 권장**.

---

## 6. Export Compliance (수출 규제)


| 질문                                  | 답변                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Does your app use encryption?       | Yes                                                                              |
| Does it qualify for any exemptions? | **Yes** — only uses HTTPS / standard system encryption (App Transport Security). |


→ `app.json` 의 `ITSAppUsesNonExemptEncryption: false` 가 이미 설정돼 있어 빌드 시 자동 면제 처리됨.

---

## 7. Content Rights / Advertising


| 질문                                                          | 답변     |
| ----------------------------------------------------------- | ------ |
| Does your app contain, show, or access third-party content? | No     |
| Does your app use the Advertising Identifier (IDFA)?        | **No** |


