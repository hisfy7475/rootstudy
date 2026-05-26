import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMealProductDetail, getMockExamOptionGroups } from '@/lib/actions/meal';
import { AdminMockExamsDetailClient } from './mock-exams-detail-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminMockExamDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [product, optionGroups] = await Promise.all([
    getMealProductDetail(id, 'exam'),
    getMockExamOptionGroups(id, { includeInactive: false }),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <div className='mx-auto max-w-xl space-y-4 p-4 md:p-8'>
      <div className='flex flex-wrap gap-2 text-sm'>
        <Link href='/admin/mock-exams' className='text-primary hover:underline'>
          모의고사 목록
        </Link>
        <span className='text-muted-foreground'>/</span>
        <span className='text-muted-foreground'>{product.name}</span>
      </div>
      <AdminMockExamsDetailClient product={product} optionGroups={optionGroups} />
    </div>
  );
}
