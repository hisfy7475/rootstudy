import type { ReactNode } from 'react';
import {
  getAdminNotifications,
  getAdminNotificationStats,
  type NotificationPeriod,
  type NotificationRecipientType,
} from '@/lib/actions/admin';
import { getUserNotifications, getUnreadUserNotificationCount } from '@/lib/actions/notification';
import { getAllBranches } from '@/lib/actions/branch';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { parseListParams } from '@/lib/list-params';
import { NOTIFICATIONS_LIST_CONFIG } from './list-config';
import { MyNotifications } from './my-notifications';
import { BranchNotificationLog } from './branch-notification-log';

export const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
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

  // ─────────────────────────────────────────────────────────────
  // 슈퍼 관리자 → 전 지점 알림 내역(모니터링). 무지점이라 본인 수신함은 비어 의미가 없음.
  // ─────────────────────────────────────────────────────────────
  if (ctx.isSuperAdmin) {
    const branches = await getAllBranches();
    const params = parseListParams(raw, NOTIFICATIONS_LIST_CONFIG);

    const allowedTypes = ['late', 'absent', 'point', 'schedule', 'system'] as const;
    const typeFilter =
      params.filters.type && (allowedTypes as readonly string[]).includes(params.filters.type)
        ? (params.filters.type as (typeof allowedTypes)[number])
        : undefined;
    const recipientFilter =
      params.filters.recipientType === 'student' || params.filters.recipientType === 'parent'
        ? (params.filters.recipientType as NotificationRecipientType)
        : undefined;
    // 기본 기간: 최근 30일(진입 시 빈 화면 방지). '7d'/'all' 은 명시 선택 시에만.
    const period: NotificationPeriod =
      params.filters.period === '7d' || params.filters.period === 'all'
        ? params.filters.period
        : '30d';

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
      <Shell subtitle='학생·학부모에게 발송된 인앱/푸시 알림 내역입니다.'>
        <BranchNotificationLog
          initialResult={branchResult}
          stats={branchStats}
          branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        />
      </Shell>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 일반 관리자 → 본인 수신함. 읽음 처리 시 사이드바 "알림 관리" 배지가 감소.
  // ─────────────────────────────────────────────────────────────
  const [myNotifications, unreadCount] = await Promise.all([
    getUserNotifications({ limit: PAGE_SIZE, offset: 0, excludeTypes: ['chat'] }),
    getUnreadUserNotificationCount({ excludeTypes: ['chat'] }),
  ]);

  return (
    <Shell>
      <MyNotifications
        initialNotifications={myNotifications}
        initialUnreadCount={unreadCount}
        userId={ctx.userId}
        pageSize={PAGE_SIZE}
      />
    </Shell>
  );
}
