import { PayResultClient } from "@/app/student/(shell)/meals/pay/result/result-client";

export default function StudentMockExamPayResultPage() {
  return (
    <div className='px-4 pt-6 pb-8'>
      <PayResultClient
        ordersHref='/student/mock-exams/orders'
        homeHref='/student/mock-exams'
        homeLabel='모의고사 목록'
      />
    </div>
  );
}
