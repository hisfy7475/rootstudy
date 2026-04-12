import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침 - 루트스터디',
};

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 text-text">
      <h1 className="text-2xl font-bold mb-8">개인정보처리방침</h1>
      <p className="text-sm text-text-muted mb-8">시행일: 2025년 4월 1일</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. 개인정보의 수집 및 이용 목적</h2>
          <p>
            루트스터디(이하 &quot;서비스&quot;)는 학습 관리 서비스 제공을 위해
            아래와 같은 개인정보를 수집·이용합니다.
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>회원 가입 및 인증: 이름, 이메일, 비밀번호, 전화번호</li>
            <li>학습 관리: 출석 기록, 학습 시간, 좌석 정보</li>
            <li>채팅 및 상담: 채팅 메시지, 업로드된 이미지·파일</li>
            <li>푸시 알림: 기기 토큰(Push Token)</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. 수집하는 개인정보 항목</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>필수:</strong> 이름, 이메일, 비밀번호, 전화번호</li>
            <li><strong>선택:</strong> 프로필 사진</li>
            <li><strong>자동 수집:</strong> 기기 정보, 앱 버전, 접속 일시</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. 카메라 및 사진 접근 권한</h2>
          <p>
            서비스는 채팅에서 이미지를 전송하기 위해 카메라 촬영 및 사진
            라이브러리 접근 권한을 요청할 수 있습니다. 해당 권한은 사용자가
            직접 이미지 전송을 요청한 경우에만 사용되며, 별도의 동의 없이
            카메라나 사진에 접근하지 않습니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. 개인정보의 보유 및 이용 기간</h2>
          <p>
            회원 탈퇴 시 지체 없이 파기합니다. 다만 관계 법령에 의해 보존이
            필요한 경우 해당 기간 동안 보관합니다.
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>계약·청약철회 기록: 5년 (전자상거래법)</li>
            <li>접속 기록: 3개월 (통신비밀보호법)</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. 개인정보의 제3자 제공</h2>
          <p>
            서비스는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지
            않습니다. 다만 법령에 의한 요청이 있는 경우 예외로 합니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. 개인정보의 처리 위탁</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Supabase Inc. — 데이터베이스 및 인증 서비스 운영</li>
            <li>Vercel Inc. — 웹 애플리케이션 호스팅</li>
            <li>Expo (EAS) — 모바일 앱 빌드 및 푸시 알림 전송</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. 이용자의 권리</h2>
          <p>
            이용자는 언제든지 자신의 개인정보에 대해 열람, 수정, 삭제,
            처리 정지를 요청할 수 있으며, 회원 탈퇴를 통해 개인정보 삭제를
            요청할 수 있습니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">8. 개인정보 보호책임자</h2>
          <ul className="list-none space-y-1">
            <li>담당: 루트스터디 운영팀</li>
            <li>이메일: support@rootstudy.co.kr</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">9. 방침 변경</h2>
          <p>
            본 방침이 변경되는 경우 시행일 최소 7일 전에 앱 내 공지사항을
            통해 안내합니다.
          </p>
        </div>
      </section>
    </main>
  );
}
