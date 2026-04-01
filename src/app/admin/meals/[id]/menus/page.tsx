import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMealProductDetail, getMealMenus } from '@/lib/actions/meal';
import { AdminMealMenusClient } from './menus-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminMealMenusPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getMealProductDetail(id);

  if (!product) {
    notFound();
  }

  const menus = await getMealMenus(id);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/meals" className="text-primary hover:underline">
          급식 목록
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href={`/admin/meals/${id}`} className="text-primary hover:underline">
          {product.name}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">메뉴</span>
      </div>
      <AdminMealMenusClient product={product} initialMenus={menus} />
    </div>
  );
}
