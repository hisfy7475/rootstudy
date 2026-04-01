import Link from 'next/link';
import { getAdminMentoringApplications, type AdminMentoringApplicationFilters } from '@/lib/actions/mentoring';
import { getTodayKST } from '@/lib/utils';
import { AdminMentoringApplicationsClient } from './applications-client';

type PageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    status?: string;
    q?: string;
  }>;
};

export default async function AdminMentoringApplicationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const today = getTodayKST();

  const filters: AdminMentoringApplicationFilters = {
    fromDate: sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : undefined,
    toDate: sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : undefined,
    status:
      sp.status === 'pending' ||
      sp.status === 'confirmed' ||
      sp.status === 'rejected' ||
      sp.status === 'cancelled'
        ? sp.status
        : 'all',
    studentSearch: sp.q?.trim() || undefined,
  };

  const rows = await getAdminMentoringApplications(filters);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <Link href="/admin/mentoring" className="text-muted-foreground hover:text-foreground mb-2 inline-block text-sm">
          ← 주간 일정
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">멘토링 신청 내역</h1>
        <p className="text-muted-foreground mt-1 text-sm">필터 후 목록 · 슬롯 링크에서 확정/거절도 가능합니다.</p>
      </div>

      <AdminMentoringApplicationsClient initialRows={rows} initialFilters={filters} today={today} />
    </div>
  );
}
