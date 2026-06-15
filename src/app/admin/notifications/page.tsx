import type { ReactNode } from 'react';
import {
  getAdminNotifications,
  getAdminNotificationStats,
  type NotificationPeriod,
  type NotificationRecipientType,
} from '@/lib/actions/admin';
import { getAllBranches } from '@/lib/actions/branch';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { parseListParams } from '@/lib/list-params';
import { NOTIFICATIONS_LIST_CONFIG } from './list-config';
import { BranchNotificationLog } from './branch-notification-log';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// 공통 필터 산출 — 슈퍼/일반 관리자 분기가 동일하게 사용.
const ALLOWED_TYPES = ['late', 'absent', 'point', 'schedule', 'system'] as const;
function parseNotificationFilters(raw: Record<string, string | string[] | undefined>) {
  const params = parseListParams(raw, NOTIFICATIONS_LIST_CONFIG);
  const typeFilter =
    params.filters.type && (ALLOWED_TYPES as readonly string[]).includes(params.filters.type)
      ? (params.filters.type as (typeof ALLOWED_TYPES)[number])
      : undefined;
  const recipientFilter =
    params.filters.recipientType === 'student' ||
    params.filters.recipientType === 'parent' ||
    params.filters.recipientType === 'branch'
      ? (params.filters.recipientType as NotificationRecipientType)
      : undefined;
  // 기본 기간: 최근 30일(진입 시 빈 화면 방지). '7d'/'all' 은 명시 선택 시에만.
  const period: NotificationPeriod =
    params.filters.period === '7d' || params.filters.period === 'all'
      ? params.filters.period
      : '30d';
  return { params, typeFilter, recipientFilter, period };
}

function Shell({ subtitle, children }: { subtitle?: string; children: ReactNode }) {
  return (
    <div className='space-y-6 p-6'>
      <div>
        <h1 className='text-2xl font-bold'>알림 관리</h1>
        {subtitle && <p className='text-text-muted mt-1 text-sm'>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default async function NotificationsManagementPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const ctx = await requireAdminBranch();

  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }

  const { params, typeFilter, recipientFilter, period } = parseNotificationFilters(raw);

  // ─────────────────────────────────────────────────────────────
  // 슈퍼 관리자 → 전 지점 통합 모니터링(지점 드롭다운으로 좁혀보기).
  // ─────────────────────────────────────────────────────────────
  if (ctx.isSuperAdmin) {
    const branches = await getAllBranches();
    const branchParam = pickFirst(raw.branch);
    const effectiveBranchId =
      branchParam && branches.some((b) => b.id === branchParam) ? branchParam : null;

    const [branchResult, branchStats] = await Promise.all([
      getAdminNotifications({
        branchId: effectiveBranchId,
        page: params.page,
        pageSize: params.pageSize,
        q: params.q,
        sort: params.sort,
        dir: params.dir,
        recipientType: recipientFilter,
        type: typeFilter,
        period,
      }),
      getAdminNotificationStats(effectiveBranchId, period),
    ]);

    return (
      <Shell subtitle='학생·학부모에게 발송된 인앱/푸시 알림 + 지점 공용 알림 내역입니다.'>
        <BranchNotificationLog
          initialResult={branchResult}
          stats={branchStats}
          branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        />
      </Shell>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 일반(지점) 관리자 → 본인 지점 통합 피드. branchId 는 액션 내부에서 ctx.branchId 로 강제됨.
  // ─────────────────────────────────────────────────────────────
  const [branchResult, branchStats] = await Promise.all([
    getAdminNotifications({
      branchId: null,
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      recipientType: recipientFilter,
      type: typeFilter,
      period,
    }),
    getAdminNotificationStats(null, period),
  ]);

  return (
    <Shell subtitle='본 지점의 학생·학부모 알림 + 지점 공용 알림 내역입니다.'>
      <BranchNotificationLog
        initialResult={branchResult}
        stats={branchStats}
        branches={[]}
        isBranchAdmin
      />
    </Shell>
  );
}
