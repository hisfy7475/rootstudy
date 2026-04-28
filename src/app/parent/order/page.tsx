import { getMealOrders, getMealProducts } from '@/lib/actions/meal';
import { getLinkedStudents } from '@/lib/actions/parent';
import { ParentOrderClient } from './order-client';

type SearchParams = Record<string, string | string[] | undefined>;

function pickString(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function ParentOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const tab = pickString(sp, 'tab') === 'orders' ? 'orders' : 'apply';
  const categoryRaw = pickString(sp, 'category');
  const category = categoryRaw === 'meal' || categoryRaw === 'exam' ? categoryRaw : 'all';

  const [mealProducts, examProducts, students] = await Promise.all([
    getMealProducts('meal'),
    getMealProducts('exam'),
    getLinkedStudents(),
  ]);

  const [mealOrders, examOrders] =
    tab === 'orders' ? await Promise.all([getMealOrders('meal'), getMealOrders('exam')]) : [[], []];

  return (
    <div className='px-4 pt-4 pb-6'>
      <h1 className='text-foreground mb-4 text-xl font-bold'>급식 · 모의고사</h1>
      <ParentOrderClient
        initialTab={tab}
        initialCategory={category}
        mealProducts={mealProducts}
        examProducts={examProducts}
        mealOrders={mealOrders}
        examOrders={examOrders}
        students={students.map((s) => ({ id: s.id, name: s.name, branchId: s.branchId }))}
      />
    </div>
  );
}
