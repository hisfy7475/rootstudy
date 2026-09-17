import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침 - 루트스터디',
};

const TH = 'border border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold';
const TD = 'border border-gray-200 px-3 py-2 align-top';

// 좁은 화면(앱 웹뷰)에서는 표를 가로 스크롤 대신 항목별 카드로 쌓아 보여준다.
const S_TABLE = 'max-sm:block';
const S_HEAD = 'max-sm:hidden';
const S_BODY = 'max-sm:block';
const S_ROW =
  'max-sm:mb-2 max-sm:block max-sm:rounded-lg max-sm:border max-sm:border-gray-200 max-sm:px-3 max-sm:py-2';
const S_TD = `${TD} max-sm:block max-sm:border-0 max-sm:px-0 max-sm:py-1 max-sm:before:mb-0.5 max-sm:before:block max-sm:before:text-[11px] max-sm:before:font-semibold max-sm:before:text-gray-400 max-sm:before:content-[attr(data-label)]`;
const S_TD_PLAIN = `${TD} max-sm:block max-sm:border-0 max-sm:px-0 max-sm:py-1`;
const S_TH_ROW = `${TH} max-sm:block max-sm:border-0 max-sm:bg-transparent max-sm:px-0 max-sm:py-1 max-sm:text-[11px] max-sm:text-gray-400`;

export default function PrivacyPage() {
  return (
    <main className='text-text mx-auto max-w-2xl px-6 py-12'>
      <h1 className='mb-2 text-2xl font-bold'>개인정보처리방침</h1>
      <p className='text-text-muted mb-8 text-sm'>개정일 및 시행일: 2026년 9월 16일</p>

      <p className='text-text-muted mb-8 text-sm leading-relaxed'>
        루트 스터디센터(이하 “센터”)는 「개인정보 보호법」 등 관련 법령을 준수하며, 회원의
        개인정보를 보호하고 개인정보와 관련한 문의 및 고충을 처리하기 위하여 다음과 같이
        개인정보처리방침을 수립·공개합니다.
      </p>

      <section className='space-y-8 text-sm leading-relaxed'>
        <div>
          <h2 className='mb-2 text-lg font-semibold'>제1조 (개인정보의 수집 및 이용 목적)</h2>
          <p>센터는 다음의 목적을 위해 필요한 범위에서 개인정보를 수집하고 이용합니다.</p>
          <ol className='mt-2 list-decimal space-y-1 pl-5'>
            <li>
              <strong>서비스 제공:</strong> 학습 공간 및 좌석 예약, 이용 계약 체결·이행, 학습 관리
              프로그램 운영, 출결 관리, 결제 및 환불 처리
            </li>
            <li>
              <strong>회원 관리:</strong> 회원 본인 확인, 회원 정보 관리, 문의 및 민원 대응, 서비스
              이용에 필요한 공지사항 전달
            </li>
            <li>
              <strong>학습 관리 및 상담:</strong> 재학 학교와 학년에 따른 학습 계획 수립, 학습 목표
              및 선호도를 반영한 상담과 교육 프로그램 안내
            </li>
            <li>
              <strong>서비스 개선:</strong> 이용 현황 분석, 프로그램 운영 개선 및 서비스 품질 관리
            </li>
            <li>
              <strong>마케팅 및 광고:</strong> 별도로 동의한 회원에 한하여 신규 프로그램, 행사 및
              혜택 안내
            </li>
          </ol>
          <p className='mt-3'>
            센터는 수집한 개인정보를 위 목적을 벗어나 이용하지 않으며, 이용 목적을 변경하는 경우
            관련 법령에 따라 별도의 동의를 받는 등 필요한 조치를 이행합니다.
          </p>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>
            제2조 (수집하는 개인정보 항목 및 수집 방법)
          </h2>
          <p>
            센터는 서비스 제공에 필요한 최소한의 개인정보를 수집하며, 선택 항목은 회원의 동의를 받아
            수집합니다.
          </p>

          <div className='mt-3 overflow-x-auto'>
            <table className={`w-full border-collapse text-xs ${S_TABLE}`}>
              <thead className={S_HEAD}>
                <tr>
                  <th className={TH}>구분</th>
                  <th className={TH}>수집 항목</th>
                  <th className={TH}>이용 목적</th>
                </tr>
              </thead>
              <tbody className={S_BODY}>
                <tr className={S_ROW}>
                  <td className={S_TD} data-label='구분'>
                    회원 가입 및 관리에 필요한 항목
                  </td>
                  <td className={S_TD} data-label='수집 항목'>
                    이름, 생년월일, 전화번호
                  </td>
                  <td className={S_TD} data-label='이용 목적'>
                    회원 확인, 이용 계약 및 회원 관리, 필수 안내
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <td className={S_TD} data-label='구분'>
                    학습 관리·상담을 위한 선택 항목
                  </td>
                  <td className={S_TD} data-label='수집 항목'>
                    <strong>재학 고등학교명, 재학 대학교명, 학년</strong>, 학습 목표, 학습 선호도
                  </td>
                  <td className={S_TD} data-label='이용 목적'>
                    학교·학년별 학습 관리, 맞춤형 상담 및 프로그램 안내
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <td className={S_TD} data-label='구분'>
                    추가 연락 및 우편 안내를 위한 선택 항목
                  </td>
                  <td className={S_TD} data-label='수집 항목'>
                    이메일, 주소
                  </td>
                  <td className={S_TD} data-label='이용 목적'>
                    회원이 신청한 이메일 안내 및 우편물 발송
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <td className={S_TD} data-label='구분'>
                    서비스 이용 과정에서 발생하는 항목
                  </td>
                  <td className={S_TD} data-label='수집 항목'>
                    예약 내역, 출결 내역, 서비스 이용 기록
                  </td>
                  <td className={S_TD} data-label='이용 목적'>
                    예약·출결 관리, 이용 내역 확인 및 서비스 개선
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <td className={S_TD} data-label='구분'>
                    결제·환불 시 필요한 항목
                  </td>
                  <td className={S_TD} data-label='수집 항목'>
                    결제수단, 결제금액, 결제일시, 거래번호, 환불 시 은행명·계좌번호·예금주명
                  </td>
                  <td className={S_TD} data-label='이용 목적'>
                    결제 확인, 정산 및 환불 처리
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <td className={S_TD} data-label='구분'>
                    마케팅에 별도 동의한 경우
                  </td>
                  <td className={S_TD} data-label='수집 항목'>
                    이름, 전화번호, 이메일, 마케팅 동의·철회 내역
                  </td>
                  <td className={S_TD} data-label='이용 목적'>
                    동의한 연락수단을 통한 프로그램·행사·혜택 안내
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className='mt-3'>
            재학 고등학교명, 재학 대학교명 및 학년은 회원에게 해당하는 항목만 수집합니다. 선택
            항목의 제공에 동의하지 않아도 기본적인 센터 이용은 가능하나, 해당 정보를 활용하는 맞춤형
            상담이나 안내는 제한될 수 있습니다.
          </p>
          <p className='mt-3'>
            개인정보는 회원가입·이용신청서, 홈페이지 또는 애플리케이션 입력, 방문·전화·온라인 상담
            및 서비스 이용 과정에서 수집합니다.
          </p>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제3조 (개인정보의 보유 및 이용 기간)</h2>
          <p>
            센터는 개인정보의 처리 목적이 달성되거나 보유기간이 종료되면 해당 정보를 지체 없이
            파기합니다.
          </p>
          <ol className='mt-2 list-decimal space-y-1 pl-5'>
            <li>
              <strong>회원 가입 및 관리 정보:</strong> 회원 탈퇴 또는 이용 계약 종료 시까지
            </li>
            <li>
              <strong>학습 관리·상담용 선택 정보:</strong> 회원 탈퇴, 이용 계약 종료, 해당 정보의
              처리 목적 달성 또는 동의 철회 중 먼저 도래하는 시점까지
            </li>
            <li>
              <strong>예약·출결 및 서비스 이용 기록:</strong> 회원 탈퇴 또는 이용 계약 종료 시까지.
              다만, 관련 법령에 따라 보존해야 하는 기록은 해당 기간까지 보관
            </li>
            <li>
              <strong>마케팅 목적의 개인정보:</strong> 회원 탈퇴, 마케팅 동의 철회 또는 해당 목적
              달성 중 먼저 도래하는 시점까지
            </li>
          </ol>

          <p className='mt-3'>
            다만, 「전자상거래 등에서의 소비자보호에 관한 법률」이 적용되는 거래에서 보존 의무가
            발생하는 경우에는 다음의 기록을 법정기간 동안 보관합니다.
          </p>

          <div className='mt-3 overflow-x-auto'>
            <table className='w-full border-collapse text-xs'>
              <thead>
                <tr>
                  <th className={TH}>보존 대상</th>
                  <th className={`${TH} w-20 text-center`}>보존 기간</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={TD}>계약 또는 청약철회 등에 관한 기록</td>
                  <td className={`${TD} text-center whitespace-nowrap`}>5년</td>
                </tr>
                <tr>
                  <td className={TD}>대금결제 및 재화·서비스 공급에 관한 기록</td>
                  <td className={`${TD} text-center whitespace-nowrap`}>5년</td>
                </tr>
                <tr>
                  <td className={TD}>소비자의 불만 또는 분쟁처리에 관한 기록</td>
                  <td className={`${TD} text-center whitespace-nowrap`}>3년</td>
                </tr>
                <tr>
                  <td className={TD}>표시·광고에 관한 기록</td>
                  <td className={`${TD} text-center whitespace-nowrap`}>6개월</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className='mt-3'>
            법령에 따라 보존하는 경우에는 거래 당사자 식별정보, 계약·결제 내역, 불만·분쟁 처리 내역
            등 보존에 필요한 정보만 다른 개인정보와 분리하여 관리하며, 해당 보존 목적 외에는
            이용하지 않습니다.
          </p>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제4조 (개인정보의 제3자 제공)</h2>
          <p>
            센터는 회원의 동의 또는 법률상 근거가 있는 경우에만 개인정보를 제3자에게 제공합니다.
          </p>
          <p className='mt-3'>
            센터는 모법인인 <strong>에스엠교육주식회사</strong>의 통합 회원관리 및 학습 관리 지원을
            위해, 회원의 별도 동의를 받아 다음과 같이 개인정보를 제공할 수 있습니다.
          </p>

          <div className='mt-3 overflow-x-auto'>
            <table className={`w-full border-collapse text-xs ${S_TABLE}`}>
              <tbody className={S_BODY}>
                <tr className={S_ROW}>
                  <th className={`${S_TH_ROW} w-28 align-top`}>제공받는 자</th>
                  <td className={S_TD_PLAIN}>
                    <strong>에스엠교육주식회사</strong>
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <th className={`${S_TH_ROW} align-top`}>제공받는 자의 이용 목적</th>
                  <td className={S_TD_PLAIN}>
                    센터 회원의 통합 관리, 학습 관리 및 상담 지원, 서비스 이용 관련 문의·민원 처리
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <th className={`${S_TH_ROW} align-top`}>제공하는 항목</th>
                  <td className={S_TD_PLAIN}>
                    이름, 전화번호, 재학 고등학교명, 재학 대학교명, 학년, 학습 목표, 학습 선호도,
                    예약·출결 및 서비스 이용 기록
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <th className={`${S_TH_ROW} align-top`}>보유 및 이용 기간</th>
                  <td className={S_TD_PLAIN}>
                    회원 탈퇴, 이용 계약 종료, 제공 목적 달성 또는 제3자 제공 동의 철회 중 먼저
                    도래하는 시점까지. 다만, 법령에 따른 보존 의무가 있는 정보는 해당 법정기간까지
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <th className={`${S_TH_ROW} align-top`}>제공 근거</th>
                  <td className={S_TD_PLAIN}>
                    「개인정보 보호법」 제17조 제1항 제1호에 따른 회원의 동의
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <th className={`${S_TH_ROW} align-top`}>동의 거부권 및 영향</th>
                  <td className={S_TD_PLAIN}>
                    회원은 제공에 동의하지 않을 수 있습니다. 동의하지 않아도 센터의 기본 서비스는
                    이용할 수 있으나, 에스엠교육주식회사가 제공하는 통합 관리·상담 지원은 제한될 수
                    있습니다.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className='mt-3'>
            제공 항목은 센터가 적법하게 수집한 정보 중 해당 목적에 필요한 범위로 한정합니다.
          </p>
          <p className='mt-3'>
            에스엠교육주식회사는 제공받은 개인정보를 위 목적 범위에서만 이용하며, 별도의 적법한 근거
            없이 자체 광고·마케팅에 이용하거나 다른 계열사 또는 외부 업체에 재제공하지 않습니다.
          </p>
          <p className='mt-3'>
            <strong>
              본 개인정보처리방침의 게시 또는 서비스 이용만으로 제3자 제공에 동의한 것으로 간주하지
              않습니다.
            </strong>{' '}
            센터는 제공에 앞서 회원에게 관련 사항을 알리고 별도의 동의를 받습니다.
          </p>
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

        <div className='border-t border-gray-200 pt-6'>
          <h2 className='mb-2 text-lg font-semibold'>부칙</h2>
          <ul className='list-disc space-y-1 pl-5'>
            <li>본 개인정보처리방침은 2026년 9월 16일부터 시행됩니다.</li>
            <li>종전 방침(2024년 12월 26일 시행)은 본 방침의 시행과 동시에 대체됩니다.</li>
            <li>본 방침에 명시되지 않은 사항은 관련 법령 및 관례에 따릅니다.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
