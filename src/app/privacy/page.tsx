import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침 - 루트스터디',
};

export default function PrivacyPage() {
  return (
    <main className='text-text mx-auto max-w-2xl px-6 py-12'>
      <h1 className='mb-2 text-2xl font-bold'>개인정보처리방침</h1>
      <p className='text-text-muted mb-8 text-sm'>시행일: 2024년 12월 26일</p>

      <p className='text-text-muted mb-8 text-sm leading-relaxed'>
        본 개인정보처리방침은 루트 스터디센터(이하 “센터”)가 제공하는 서비스와 관련하여, 회원의
        개인정보를 보호하기 위해 센터가 준수해야 할 사항을 규정합니다.
      </p>

      <section className='space-y-6 text-sm leading-relaxed'>
        <div>
          <h2 className='mb-2 text-lg font-semibold'>제1조 (개인정보의 수집 및 이용 목적)</h2>
          <p>센터는 다음의 목적을 위해 개인정보를 수집하고 이용합니다.</p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            <li>
              <strong>서비스 제공:</strong> 학습 공간 예약, 학습 관리 프로그램 운영 등
            </li>
            <li>
              <strong>회원 관리:</strong> 회원 본인 확인, 문의 대응, 공지사항 전달 등
            </li>
            <li>
              <strong>마케팅 및 광고:</strong> 서비스 개선을 위한 통계 분석 및 맞춤형 서비스 제공
            </li>
          </ul>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제2조 (수집하는 개인정보 항목)</h2>
          <ul className='list-disc space-y-1 pl-5'>
            <li>
              <strong>필수 항목:</strong> 이름, 생년월일, 연락처(전화번호, 이메일), 주소, 서비스
              이용 기록, 결제 정보
            </li>
            <li>
              <strong>선택 항목:</strong> 학습 목표, 학습 선호도
            </li>
          </ul>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제3조 (개인정보의 보유 및 이용 기간)</h2>
          <p>
            센터는 법령에 따라 개인정보를 보유하며, 수집 및 이용 목적이 달성된 후에는 해당 정보를
            지체 없이 파기합니다.
          </p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            <li>회원 가입 정보: 회원 탈퇴 시까지 보유</li>
            <li>
              결제 정보: 거래 완료 후 5년간 보유 (전자상거래 등에서의 소비자보호에 관한 법률에 따라)
            </li>
          </ul>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제4조 (개인정보의 제3자 제공)</h2>
          <p>
            센터는 원칙적으로 회원의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의 경우에는
            예외로 합니다.
          </p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            <li>회원이 사전에 동의한 경우</li>
            <li>법령에 따라 요구되는 경우</li>
          </ul>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제5조 (개인정보의 처리 위탁)</h2>
          <p>
            센터는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁할 수 있습니다. 위탁 시
            관련 법령에 따라 개인정보가 안전하게 관리되도록 필요한 조치를 취합니다.
          </p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            <li>
              <strong>위탁 대상:</strong> 결제 대행사, 문자/이메일 발송 대행사 등
            </li>
            <li>
              <strong>위탁 업무:</strong> 결제 처리, 서비스 안내 등
            </li>
          </ul>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제6조 (회원의 권리 및 행사 방법)</h2>
          <p>
            회원은 언제든지 본인의 개인정보에 대한 열람, 수정, 삭제, 처리 정지를 요구할 수 있습니다.
            회원의 요청은 센터의 고객센터를 통해 접수되며, 센터는 관련 법령에 따라 조치합니다.
          </p>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제7조 (개인정보의 파기 절차 및 방법)</h2>
          <p>
            센터는 개인정보 보유 기간이 경과하거나 처리 목적이 달성된 경우 해당 정보를 지체 없이
            파기합니다.
          </p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            <li>전자적 파일 형태: 복구 불가능한 방법으로 영구 삭제</li>
            <li>종이 문서: 분쇄하거나 소각</li>
          </ul>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>
            제8조 (개인정보 보호를 위한 기술적/관리적 대책)
          </h2>
          <p>센터는 회원의 개인정보를 보호하기 위해 다음과 같은 조치를 취합니다.</p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            <li>기술적 대책: 개인정보 암호화, 방화벽 설치, 보안 프로그램 운영</li>
            <li>관리적 대책: 개인정보 접근 권한 관리, 직원 교육 실시</li>
          </ul>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제9조 (개인정보 보호책임자)</h2>
          <p>회원의 개인정보와 관련된 문의는 아래의 개인정보 보호책임자에게 연락하시기 바랍니다.</p>
          <ul className='mt-2 list-none space-y-1'>
            <li>이름: 오현경</li>
            <li>직책: 센터장</li>
            <li>연락처: 010-2679-8681, rootstudy2025@gmail.com</li>
          </ul>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제10조 (정책 변경에 대한 공지)</h2>
          <p>
            본 방침은 관련 법령의 개정 또는 내부 방침에 따라 변경될 수 있으며, 변경 시 센터의
            홈페이지 또는 공지사항을 통해 회원에게 알립니다.
          </p>
        </div>

        <div className='border-border border-t pt-6'>
          <h2 className='mb-2 text-lg font-semibold'>부칙</h2>
          <ul className='list-disc space-y-1 pl-5'>
            <li>본 개인정보처리방침은 2024년 12월 26일부터 시행됩니다.</li>
            <li>본 방침에 명시되지 않은 사항은 관련 법령 및 관례에 따릅니다.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
