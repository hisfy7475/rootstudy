import { PayResultClient } from './result-client';

export default function StudentMealPayResultPage() {
  return (
    <div className="px-4 pt-6 pb-8">
      <PayResultClient ordersHref="/student/meals/orders" homeHref="/student/meals" />
    </div>
  );
}
