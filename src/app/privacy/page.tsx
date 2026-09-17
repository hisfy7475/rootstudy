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
            센터는 서비스 제공에 필요한 업무를 외부 업체에 위탁하는 경우, 수탁자와 위탁 업무를
            공개합니다.
          </p>

          <div className='mt-3 overflow-x-auto'>
            <table className={`w-full border-collapse text-xs ${S_TABLE}`}>
              <thead className={S_HEAD}>
                <tr>
                  <th className={TH}>수탁자</th>
                  <th className={TH}>위탁 업무</th>
                </tr>
              </thead>
              <tbody className={S_BODY}>
                <tr className={S_ROW}>
                  <td className={S_TD} data-label='수탁자'>
                    전자결제 대행사
                  </td>
                  <td className={S_TD} data-label='위탁 업무'>
                    전자결제 처리 및 결제 취소·환불 지원
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <td className={S_TD} data-label='수탁자'>
                    문자·이메일 발송 대행사
                  </td>
                  <td className={S_TD} data-label='위탁 업무'>
                    서비스 이용 안내, 공지사항 및 동의한 광고성 정보 발송
                  </td>
                </tr>
                <tr className={S_ROW}>
                  <td className={S_TD} data-label='수탁자'>
                    회원관리 시스템 운영·유지보수 업체
                  </td>
                  <td className={S_TD} data-label='위탁 업무'>
                    회원관리 시스템 운영·유지보수 및 데이터 보관
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className='mt-3'>
            센터는 위탁계약에 업무 목적 외 개인정보 처리 금지, 안전성 확보 조치, 재위탁 제한,
            관리·감독 및 책임에 관한 사항을 명시하고, 수탁자의 개인정보 처리 현황을 감독합니다.
          </p>
          <p className='mt-3'>
            수탁자 또는 위탁 업무가 변경되는 경우에는 변경 내용을 본 개인정보처리방침에 공개하며,
            법령상 별도 통지가 필요한 경우에는 해당 절차를 이행합니다.
          </p>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>
            제6조 (회원 및 법정대리인의 권리와 행사 방법)
          </h2>
          <p>
            회원은 센터에 본인의 개인정보에 대한 열람, 정정, 삭제, 처리 정지 및 동의 철회를 요구할
            수 있습니다.
          </p>
          <p className='mt-3'>
            권리 행사는 제9조의 개인정보 보호책임자에게 전화, 이메일 또는 서면으로 요청할 수 있으며,
            센터는 요청자의 본인 여부 또는 적법한 대리 권한을 확인한 후 관련 법령에 따라 처리합니다.
          </p>
          <p className='mt-3'>
            센터는 개인정보의 정정 또는 삭제를 요구받은 경우, 해당 조치가 완료될 때까지 그
            개인정보를 이용하거나 제공하지 않습니다. 다만, 다른 법령에 따라 보존해야 하는 정보 등은
            삭제 또는 처리 정지가 제한될 수 있으며, 이 경우 그 사유를 안내합니다.
          </p>
          <p className='mt-3'>
            만 14세 미만 아동의 개인정보 처리에 동의가 필요한 경우에는 법정대리인의 동의를 받고 이를
            확인합니다. 법정대리인은 아동의 개인정보에 대한 열람, 정정, 삭제, 처리 정지 및 동의
            철회를 요구할 수 있습니다.
          </p>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제7조 (개인정보의 파기 절차 및 방법)</h2>
          <p>
            센터는 보유기간 경과, 처리 목적 달성 또는 동의 철회 등으로 개인정보가 불필요하게 된 경우
            지체 없이 파기합니다.
          </p>
          <p className='mt-3'>
            다만, 다른 법령에 따라 보존해야 하는 경우에는 해당 정보를 분리하여 보관한 후 법정
            보존기간이 종료되면 파기합니다.
          </p>
          <ul className='mt-3 list-disc space-y-1 pl-5'>
            <li>
              <strong>파기 절차:</strong> 파기 대상과 법정 보존 필요 여부를 확인한 후, 개인정보
              보호책임자의 관리 아래 파기
            </li>
            <li>
              <strong>전자적 파일:</strong> 복구 또는 재생할 수 없는 방법으로 삭제
            </li>
            <li>
              <strong>종이 문서:</strong> 분쇄 또는 소각
            </li>
          </ul>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제8조 (개인정보의 안전성 확보 조치)</h2>
          <p>
            센터는 개인정보의 분실, 도난, 유출, 위조, 변조 또는 훼손을 방지하기 위해 다음의 조치를
            취합니다.
          </p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            <li>
              <strong>관리적 조치:</strong> 개인정보 취급자 최소화, 접근 권한 관리, 직원 교육 및
              수탁자 관리·감독
            </li>
            <li>
              <strong>기술적 조치:</strong> 법령에서 요구하는 개인정보 암호화, 접근 통제, 접속기록
              보관·점검, 보안 프로그램 운영 및 갱신
            </li>
            <li>
              <strong>물리적 조치:</strong> 개인정보 보관 장소의 출입 통제 및 종이 문서의 잠금장치
              보관
            </li>
          </ul>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제9조 (개인정보 보호책임자 및 문의처)</h2>
          <p>
            센터는 개인정보 처리 업무를 총괄하고 회원의 문의 및 고충을 처리하기 위하여 다음과 같이
            개인정보 보호책임자를 지정합니다.
          </p>
          <ul className='mt-2 list-none space-y-1'>
            <li>이름: 서규형</li>
            <li>직책: 사업본부장</li>
            <li>전화번호: 010-2922-8112</li>
            <li>이메일: rootstudy2025@gmail.com</li>
          </ul>
          <p className='mt-3'>
            회원은 개인정보 보호 관련 문의, 열람 등 권리 행사, 불만 처리 및 피해 구제에 관한 사항을
            위 연락처로 요청할 수 있습니다.
          </p>
        </div>

        <div>
          <h2 className='mb-2 text-lg font-semibold'>제10조 (개인정보처리방침의 변경)</h2>
          <p>
            센터는 관련 법령, 제공 서비스 또는 개인정보 처리 업무의 변경에 따라 본 방침을 개정할 수
            있습니다.
          </p>
          <p className='mt-3'>
            개정 시에는 변경 내용과 시행일을 홈페이지 또는 공지사항을 통해 안내합니다. 수집·이용
            목적이나 제3자 제공 사항의 변경으로 별도 동의가 필요한 경우에는 해당 처리를 시작하기
            전에 동의를 받습니다.
          </p>
          <p className='mt-3'>이전 개인정보처리방침은 회원이 확인할 수 있도록 함께 공개합니다.</p>
        </div>

        <div className='border-t border-gray-200 pt-6'>
          <h2 className='mb-2 text-lg font-semibold'>부칙</h2>
          <ol className='list-decimal space-y-1 pl-5'>
            <li>
              본 개인정보처리방침은 <strong>2026년 9월 16일</strong>부터 시행합니다.
            </li>
            <li>
              종전 개인정보처리방침의 시행일은 <strong>2024년 12월 26일</strong>입니다.
            </li>
            <li>
              기존 회원에 대해서도 새롭게 동의가 필요한 개인정보 수집·이용 및 제3자 제공은 해당
              동의를 받은 후 시행합니다.
            </li>
            <li>본 방침에 명시되지 않은 사항은 「개인정보 보호법」 등 관련 법령에 따릅니다.</li>
          </ol>
        </div>
      </section>
    </main>
  );
}
