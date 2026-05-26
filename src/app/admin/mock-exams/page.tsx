import { getMealProductsForAdmin, getMockExamOptionGroupsByProducts } from '@/lib/actions/meal';
import { formatMockExamOptionLineup } from '@/lib/mock-exam-options';
import { AdminMockExamsClient } from './mock-exams-client';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    size?: string;
    q?: string;
    status?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function AdminMockExamsPage({ searchParams }: PageProps) {
  const raw = await searchParams;

  const page = Math.max(1, Number.parseInt(raw.page ?? '1', 10) || 1);
  const sizeNum = Number.parseInt(raw.size ?? '20', 10);
  const pageSize = [20, 50, 100].includes(sizeNum) ? sizeNum : 20;
  const status =
    raw.status === 'active' || raw.status === 'inactive' || raw.status === 'sold_out'
      ? raw.status
      : undefined;
  const sort = raw.sort === 'name' ? 'name' : 'created_at';
  const dir = raw.dir === 'asc' ? 'asc' : 'desc';

  const result = await getMealProductsForAdmin({
    category: 'exam',
    page,
    pageSize,
    q: raw.q,
    status,
    sort,
    dir,
  });

  const optionGroupsByProduct = await getMockExamOptionGroupsByProducts(
    result.rows.map((r) => r.id),
  );
  const optionSummaries: Record<string, string> = {};
  for (const productId of Object.keys(optionGroupsByProduct)) {
    optionSummaries[productId] = formatMockExamOptionLineup(optionGroupsByProduct[productId]);
  }

  return <AdminMockExamsClient initialResult={result} optionSummaries={optionSummaries} />;
}
