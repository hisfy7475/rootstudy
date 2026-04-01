import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMealProductDetail } from '@/lib/actions/meal';
import { AdminMealsDetailClient } from './meals-detail-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminMealDetailPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getMealProductDetail(id);

  if (!product) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/meals" className="text-primary hover:underline">
          급식 목록
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{product.name}</span>
      </div>
      <AdminMealsDetailClient product={product} />
    </div>
  );
}
