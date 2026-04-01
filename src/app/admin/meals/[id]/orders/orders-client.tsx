'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminCancelMealOrder, type MealOrderForAdmin, type MealOrderAdminFilter } from '@/lib/actions/meal';
import type { MealProduct } from '@/types/database';
import { Download, Loader2 } from 'lucide-react';
import { cn, getTodayKST } from '@/lib/utils';

type StatusTab = MealOrderAdminFilter['status'];

const statusLabel: Record<string, string> = {
  pending: '결제 대기',
  paid: '결제 완료',
  cancelled: '취소',
  refunded: '환불',
  failed: '실패',
};

interface AdminMealOrdersClientProps {
  product: MealProduct;
  initialOrders: MealOrderForAdmin[];
}

export function AdminMealOrdersClient({ product, initialOrders }: AdminMealOrdersClientProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const paidCount = useMemo(() => orders.filter((o) => o.status === 'paid').length, [orders]);

  const filtered = useMemo(() => {
    if (statusTab === 'all') return orders;
    return orders.filter((o) => o.status === statusTab);
  }, [orders, statusTab]);

  const openCancel = (id: string) => {
    setCancelId(id);
    setCancelReason('');
    setFlash(null);
  };

  const submitCancel = async () => {
    if (!cancelId) return;
    const reason = cancelReason.trim() || '관리자 취소';
    setCancelLoading(true);
    setFlash(null);
    const res = await adminCancelMealOrder(cancelId, reason);
    setCancelLoading(false);
    if (res.error) {
      setFlash({ type: 'err', text: res.error });
      return;
    }
    setOrders((prev) =>
      prev.map((o) =>
        o.id === cancelId
          ? {
              ...o,
              status: 'cancelled' as const,
              cancelled_at: new Date().toISOString(),
              cancel_reason: reason,
            }
          : o
      )
    );
    setCancelId(null);
    setFlash({ type: 'ok', text: '취소 처리되었습니다.' });
  };

  const exportXlsx = async () => {
    if (orders.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    setExporting(true);
    try {
      const rows = orders.map((o) => ({
        학생명: o.student_name ?? '',
        결제자명: o.payer_name ?? '',
        상태: statusLabel[o.status] ?? o.status,
        금액: o.amount,
        주문번호: o.order_id,
        결제일: o.paid_at
          ? new Date(o.paid_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
          : '',
        취소일: o.cancelled_at
          ? new Date(o.cancelled_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
          : '',
        취소사유: o.cancel_reason ?? '',
        식사시작일: product.meal_start_date,
        식사종료일: product.meal_end_date,
      }));

      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      const colWidths = Object.keys(rows[0]).map((key) => ({
        wch: Math.max(
          key.length * 2,
          ...rows.map((row) => String((row as Record<string, unknown>)[key] ?? '').length * 1.2)
        ),
      }));
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, '신청현황');
      XLSX.writeFile(wb, `급식신청_${product.name}_${getTodayKST()}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const tabs: { key: StatusTab; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'pending', label: '결제 대기' },
    { key: 'paid', label: '결제 완료' },
    { key: 'cancelled', label: '취소' },
    { key: 'refunded', label: '환불' },
    { key: 'failed', label: '실패' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">신청 현황</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {product.name} · 결제 완료 {paidCount}건
            {product.max_capacity != null ? ` / 정원 ${product.max_capacity}명` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/meals/${product.id}`}
            className="border-primary text-primary hover:bg-primary/10 inline-flex items-center justify-center rounded-2xl border-2 px-5 py-2.5 text-sm font-medium transition-all focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none"
          >
            상품 정보
          </Link>
          <Button variant="outline" disabled={exporting} onClick={() => void exportXlsx()}>
            {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            Excel
          </Button>
        </div>
      </div>

      {flash && (
        <div
          className={
            flash.type === 'ok'
              ? 'rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900'
              : 'bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm'
          }
        >
          {flash.text}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key ?? 'all'}
            type="button"
            onClick={() => setStatusTab(t.key)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              statusTab === t.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b text-left">
              <tr>
                <th className="p-3 font-medium">학생</th>
                <th className="p-3 font-medium">결제자</th>
                <th className="p-3 font-medium">상태</th>
                <th className="p-3 font-medium">금액</th>
                <th className="p-3 font-medium">결제일</th>
                <th className="p-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground p-8 text-center">
                    내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="p-3">{o.student_name ?? o.student_id.slice(0, 8)}</td>
                    <td className="p-3">{o.payer_name ?? o.user_id.slice(0, 8)}</td>
                    <td className="p-3">
                      <span className="text-xs">{statusLabel[o.status] ?? o.status}</span>
                    </td>
                    <td className="p-3">{o.amount.toLocaleString()}원</td>
                    <td className="p-3 whitespace-nowrap text-xs">
                      {o.paid_at
                        ? new Date(o.paid_at).toLocaleString('ko-KR', {
                            timeZone: 'Asia/Seoul',
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '-'}
                    </td>
                    <td className="p-3">
                      {o.status === 'paid' ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => openCancel(o.id)}>
                          취소/환불
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {cancelId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-w-md p-6 shadow-lg">
            <h2 className="text-lg font-semibold">관리자 취소·환불</h2>
            <p className="text-muted-foreground mt-2 text-sm">나이스페이 취소 API가 호출됩니다.</p>
            <label className="mt-4 block text-sm font-medium">사유</label>
            <textarea
              className="border-input bg-background mt-1 min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="취소 사유 (예: 수량 조정)"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCancelId(null)} disabled={cancelLoading}>
                닫기
              </Button>
              <Button type="button" variant="danger" disabled={cancelLoading} onClick={() => void submitCancel()}>
                {cancelLoading ? <Loader2 className="size-4 animate-spin" /> : '확인'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
