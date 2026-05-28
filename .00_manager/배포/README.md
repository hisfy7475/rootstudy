# 루트스터디 앱 — 스토어 배포 자료 모음

> App Store Connect / Google Play Console 신규 등록에 필요한 모든 텍스트·메타데이터·심사 답변 가이드를 한곳에 정리한 폴더.
> 빌드 자체는 `.00_manager/ROADMAP.md` Phase 1 / `eas.json` 참고.

---

## 폴더 구성

| 파일 | 용도 |
|------|------|
| `01_앱-기본정보.md` | iOS/Android 공통 — 번들ID, 버전, 카테고리, 연락처, URL 일괄 |
| `02_App-Store-Connect.md` | iOS — 이름/부제/키워드/프로모션/설명/심사정보(데모계정·메모) |
| `03_Google-Play-Console.md` | Android — 앱 제목/짧은 설명/자세한 설명/연락처/콘텐츠 가이드 |
| `04_콘텐츠등급-데이터안전.md` | 양 스토어의 등급 분류 설문 + Play 데이터 안전 섹션 정답표 |
| `05_스크린샷-아트워크.md` | 필요한 이미지 사양/개수/제작 체크리스트 |
| `06_출시노트.md` | 1.0.0 ~ 향후 버전 What's New 템플릿 |
| `07_최종-체크리스트.md` | 제출 직전 마지막 점검 |

---

## 가장 먼저 알아야 할 URL (이미 운영 중)

| 항목 | URL |
|------|-----|
| 마케팅 / 지원 사이트 | `https://www.rootstudy.co.kr` |
| **개인정보처리방침** | `https://www.rootstudy.co.kr/privacy` |
| **계정/데이터 삭제 요청** | `https://www.rootstudy.co.kr/account-deletion` |
| 지원 이메일 | `support@rootstudy.co.kr` |

→ 두 페이지(`privacy`, `account-deletion`) 모두 이미 Next.js로 구현되어 있어서 추가로 만들 필요 없음.
   (`src/app/privacy/page.tsx`, `src/app/account-deletion/page.tsx`)

---

## 제출 흐름 요약

```
[1] 빌드 산출물 준비
    iOS  : EAS production 프로파일 → .ipa → App Store Connect 업로드
    AOS  : EAS production 프로파일 → .aab → Play Console 내부 테스트 트랙

[2] 스토어 콘솔 메타데이터 입력
    - 02 / 03 파일의 텍스트를 그대로 복붙

[3] 심사 부가 정보 입력
    - iOS : Review Information (데모 계정/연락처/메모) → 02 파일
    - AOS : 콘텐츠 등급 설문 + 데이터 안전 → 04 파일

[4] 스크린샷 업로드 → 05 파일 사양표대로

[5] 제출 → 07 체크리스트로 최종 검수
```

---

## 주의

- **iOS는 카드사 앱 호출(LSApplicationQueriesSchemes), 카메라/사진 권한** 때문에 거절률이 높음 → 02 파일의 "심사 메모" 섹션을 반드시 그대로 적기.
- **Play의 "데이터 안전(Data safety)"** 은 자동 검출이 아니라 자기신고 → 04 파일의 표 그대로 따라 입력.
- 앱 카테고리는 양쪽 모두 **교육(Education)** 으로 통일.
- **17세 미만(주 사용자: 중·고등학생)** 사용을 전제로 등급 산정.
