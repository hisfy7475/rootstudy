import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '계정 삭제 요청 - 루트스터디',
};

export default function AccountDeletionPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 text-text">
      <h1 className="text-2xl font-bold mb-8">계정 및 데이터 삭제 요청</h1>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">삭제 요청 방법</h2>
          <p>
            아래 방법 중 하나를 통해 계정 삭제를 요청할 수 있습니다.
          </p>
          <ol className="list-decimal pl-5 mt-3 space-y-2">
            <li>
              <strong>앱/웹 내 설정</strong> — 로그인 후 설정 &gt; 계정 삭제 메뉴에서 직접 삭제
            </li>
            <li>
              <strong>이메일 요청</strong> — 아래 이메일로 가입 시 사용한 이름과 이메일을 보내주세요
              <p className="mt-1 text-text-muted">
                📧 <a href="mailto:support@rootstudy.co.kr" className="text-primary underline">support@rootstudy.co.kr</a>
              </p>
            </li>
          </ol>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">삭제되는 데이터</h2>
          <p>계정 삭제 시 아래 데이터가 영구적으로 삭제됩니다.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>계정 정보 (이름, 이메일, 전화번호, 비밀번호)</li>
            <li>학습 기록 (출석, 학습 시간, 통계)</li>
            <li>채팅 메시지 및 업로드된 파일</li>
            <li>푸시 알림 토큰</li>
            <li>설정 및 기기 정보</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">보관되는 데이터</h2>
          <p>관계 법령에 따라 아래 데이터는 일정 기간 보관 후 파기됩니다.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>계약·청약철회 기록: 5년 (전자상거래법)</li>
            <li>접속 기록: 3개월 (통신비밀보호법)</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">처리 기간</h2>
          <p>
            삭제 요청 접수 후 <strong>영업일 기준 7일 이내</strong>에 처리되며,
            처리 완료 시 이메일로 안내드립니다.
          </p>
        </div>
      </section>
    </main>
  );
}
