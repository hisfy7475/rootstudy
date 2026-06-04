import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '서비스 이용약관 - 루트스터디',
};

export default function TermsPage() {
  return (
    <main className='text-text mx-auto max-w-2xl px-6 py-12'>
      <h1 className='mb-2 text-2xl font-bold'>서비스 이용약관</h1>
      <p className='text-text-muted mb-8 text-sm'>시행일: 2024년 12월 26일</p>

      {/* 1부. 결제 및 환불 약관 */}
      <h2 className='mb-4 text-xl font-bold'>제1부. 결제 및 환불 약관</h2>
      <section className='space-y-6 text-sm leading-relaxed'>
        <div>
          <h3 className='mb-2 text-base font-semibold'>제1조 (목적)</h3>
          <p>
            본 약관은 회사(이하 “회사”)가 제공하는 결제 서비스(이하 “서비스”)를 이용함에 있어 결제
            및 환불과 관련된 이용자의 권리와 의무를 규정함을 목적으로 합니다.
          </p>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제2조 (정의)</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>
              <strong>“결제 서비스”</strong>란 이용자가 회사가 제공하는 서비스(급식 신청, 모의고사
              신청 등)를 이용하기 위해 전자적 방식으로 결제하는 행위를 의미합니다.
            </li>
            <li>
              <strong>“급식 신청”</strong>이란 이용자가 일정 기간 동안 제공되는 급식을 신청하고
              결제하는 것을 의미합니다.
            </li>
            <li>
              <strong>“모의고사 신청”</strong>이란 특정 날짜에 시행되는 모의고사를 신청하고 결제하는
              것을 의미합니다.
            </li>
            <li>
              <strong>“환불”</strong>이란 결제된 금액을 이용자에게 반환하는 행위를 의미합니다.
            </li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제3조 (결제 방식)</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>
              이용자는 회사가 제공하는 결제 시스템을 통해 신용카드, 체크카드, 간편결제 등의 방법으로
              결제할 수 있습니다.
            </li>
            <li>
              모의고사 신청은 반드시 단독 결제로 진행해야 하며, 급식 신청과 함께 결제할 수 없습니다.
            </li>
            <li>
              급식 신청과 모의고사 신청을 함께 결제한 경우, 별도 결제 지침을 따르지 않은 것으로
              간주되며, 회사는 결제 취소를 요청할 수 있습니다.
            </li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제4조 (환불 정책)</h3>
          <p className='font-medium'>1. 급식 신청 환불</p>
          <ul className='mt-1 list-disc space-y-1 pl-5'>
            <li>급식 신청은 신청일 기준 2일 전까지 가능하며, 이후에는 환불이 불가합니다.</li>
            <li>
              부분 환불은 지원되지 않으며, 여러 건의 급식을 신청한 경우 개별 결제를 진행해야만 개별
              환불이 가능합니다.
            </li>
            <li>신청 후 이용자가 환불을 요청하더라도 환불 불가능 기간 내에는 처리되지 않습니다.</li>
          </ul>
          <p className='mt-3 font-medium'>2. 모의고사 신청 환불</p>
          <ul className='mt-1 list-disc space-y-1 pl-5'>
            <li>모의고사 신청은 결제 후 어떠한 경우에도 환불이 불가합니다.</li>
            <li>
              이용자는 결제 전에 반드시 해당 정책을 확인해야 하며, 결제 완료 후 환불 요청은 받지
              않습니다.
            </li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제5조 (환불 절차 및 기간)</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>
              환불 요청은 마이페이지 - 결제내역을 통해 신청할 수 있으며, 환불을 신청할 경우 결제
              수단에 따라 일정 기간 내에 처리됩니다.
            </li>
            <li>환불 승인 후 실제 환불 처리까지는 최대 7영업일이 소요될 수 있습니다.</li>
            <li>환불 불가 기간 내 요청된 환불은 처리되지 않습니다.</li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제6조 (책임의 한계)</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>
              이용자가 결제 정책을 충분히 확인하지 않고 결제를 진행한 경우, 회사는 이에 대한 책임을
              지지 않습니다.
            </li>
            <li>
              이용자의 실수로 인한 중복 결제, 잘못된 결제 등은 환불 규정에 따라 처리되며, 이용자의
              단순 변심에 의한 환불 요청은 불가합니다.
            </li>
          </ul>
        </div>
      </section>

      {/* 2부. 이용약관 */}
      <h2 className='border-border mt-12 mb-4 border-t pt-8 text-xl font-bold'>제2부. 이용약관</h2>
      <p className='text-text-muted mb-6 text-sm leading-relaxed'>
        본 약관은 루트 스터디센터(이하 “센터”)와 센터를 이용하는 모든 사용자(이하 “회원”) 간의 권리,
        의무 및 책임사항을 규정합니다. 센터를 이용하기 전 반드시 본 약관을 숙지하시기 바랍니다.
      </p>
      <section className='space-y-6 text-sm leading-relaxed'>
        <div>
          <h3 className='mb-2 text-base font-semibold'>제1조 (목적)</h3>
          <p>
            본 약관은 센터가 제공하는 서비스의 이용 조건 및 절차, 기타 필요한 사항을 규정함을
            목적으로 합니다.
          </p>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제2조 (정의)</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>
              <strong>“센터”:</strong> 회원이 학습 공간과 관련된 서비스를 이용할 수 있도록 제공하는
              시설 및 시스템
            </li>
            <li>
              <strong>“회원”:</strong> 본 약관에 따라 센터와 이용 계약을 체결하고 서비스를 이용하는
              개인
            </li>
            <li>
              <strong>“서비스”:</strong> 센터가 제공하는 학습 공간, 학습 관리 프로그램, 기타 관련
              부대 서비스
            </li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제3조 (약관의 효력 및 변경)</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>본 약관은 회원이 센터 이용 계약을 체결하는 시점부터 효력을 발생합니다.</li>
            <li>
              센터는 관련 법령을 위배하지 않는 범위에서 본 약관을 변경할 수 있으며, 변경된 약관은
              센터의 홈페이지나 공지사항을 통해 사전 공지합니다.
            </li>
            <li>
              회원은 변경된 약관에 동의하지 않을 경우 이용 계약을 해지할 수 있으며, 변경된 약관 발표
              이후에도 서비스를 계속 이용할 경우 약관 변경에 동의한 것으로 간주합니다.
            </li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제4조 (회원 가입 및 이용 계약)</h3>
          <p>
            회원 가입은 센터가 제공하는 신청서를 작성하고 약관에 동의한 후 센터의 승인을 통해
            완료됩니다. 센터는 다음과 같은 경우 신청 승인을 거절할 수 있습니다.
          </p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            <li>허위 정보를 기재한 경우</li>
            <li>타인의 명의를 도용한 경우</li>
            <li>기타 센터가 부적합하다고 판단하는 경우</li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제5조 (서비스 이용 시간)</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>서비스 이용 시간은 센터의 운영 정책에 따릅니다.</li>
            <li>
              센터는 필요에 따라 이용 시간을 변경하거나 일시 중단할 수 있으며, 이 경우 사전에
              회원에게 공지합니다.
            </li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제6조 (이용 요금 및 결제)</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>이용 요금은 센터가 정한 기준에 따라 부과됩니다.</li>
            <li>
              회원은 이용 계약 시 명시된 방식으로 요금을 납부해야 하며, 미납 시 서비스 이용이 제한될
              수 있습니다.
            </li>
            <li>환불 정책은 별도로 공지된 환불 규정을 따릅니다.</li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제7조 (회원의 의무)</h3>
          <p>회원은 다음 사항을 준수해야 합니다.</p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            <li>센터 시설 및 기기의 훼손 금지</li>
            <li>다른 회원의 학습 환경을 방해하지 않기</li>
            <li>센터의 정책 및 공지사항 준수</li>
          </ul>
          <p className='mt-2'>
            회원이 본 약관을 위반하거나 센터에 손해를 끼칠 경우, 센터는 회원 자격을 박탈하거나 손해
            배상을 청구할 수 있습니다.
          </p>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제8조 (센터의 의무)</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>센터는 회원에게 안정적이고 쾌적한 학습 환경을 제공하기 위해 최선을 다합니다.</li>
            <li>센터는 회원의 개인정보를 보호하며, 동의 없이 제3자에게 제공하지 않습니다.</li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제9조 (계약 해지 및 이용 제한)</h3>
          <p>회원은 이용 계약을 해지하고자 할 경우 사전에 센터에 통보해야 합니다.</p>
          <p className='mt-2'>
            센터는 다음과 같은 경우 회원의 서비스 이용을 제한하거나 계약을 해지할 수 있습니다.
          </p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            <li>회원이 이용 요금을 미납한 경우</li>
            <li>회원이 본 약관을 위반한 경우</li>
          </ul>
        </div>

        <div>
          <h3 className='mb-2 text-base font-semibold'>제10조 (책임 제한)</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>
              센터는 천재지변, 정전 등 불가항력으로 인해 서비스를 제공할 수 없는 경우 책임을 지지
              않습니다.
            </li>
            <li>회원의 귀책 사유로 발생한 문제에 대해서는 센터가 책임을 지지 않습니다.</li>
          </ul>
        </div>

        <div className='border-border border-t pt-6'>
          <h3 className='mb-2 text-base font-semibold'>부칙</h3>
          <ul className='list-disc space-y-1 pl-5'>
            <li>본 약관은 2024년 12월 26일부터 시행됩니다.</li>
            <li>본 약관에 명시되지 않은 사항은 관련 법령 및 관례에 따릅니다.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
