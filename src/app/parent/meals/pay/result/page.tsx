import { PayResultClient } from '@/app/student/(shell)/meals/pay/result/result-client';

export default function ParentMealPayResultPage() {
  return (
    <div className="px-4 pt-6 pb-8">
      <PayResultClient ordersHref="/parent/meals/orders" homeHref="/parent/meals" />
    </div>
  );
}
