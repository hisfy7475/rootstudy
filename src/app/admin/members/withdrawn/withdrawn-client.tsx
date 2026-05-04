'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import { restoreMember, type WithdrawnMemberRow } from '@/lib/actions/admin';
import { ArrowLeft, Eye, RotateCcw, UserX } from 'lucide-react';
import { WithdrawnDetailModal } from './_components/withdrawn-detail-modal';

interface Props {
  rows: WithdrawnMemberRow[];
  total: number;
  page: number;
  pageSize: number;
}

const USER_TYPE_LABEL: Record<WithdrawnMemberRow['user_type'], string> = {
  student: '학생',
  parent: '학부모',
  admin: '관리자',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WithdrawnMembersClient({ rows, total, page, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [restoreTarget, setRestoreTarget] = useState<WithdrawnMemberRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<WithdrawnMemberRow | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    if (confirmName.trim() !== restoreTarget.name.trim()) {
      alert('회원 이름이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const result = await restoreMember(restoreTarget.id);
      if (result.success) {
        if (result.warning) alert(result.warning);
        setRestoreTarget(null);
        setConfirmName('');
        router.refresh();
      } else {
        alert(result.error || '복구에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to restore member:', error);
      alert('복구 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='space-y-4 p-6'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Link
            href='/admin/members'
            className='text-text-muted hover:text-text inline-flex items-center gap-1 text-sm'
          >
            <ArrowLeft className='h-4 w-4' />
            회원 관리로 돌아가기
          </Link>
        </div>
      </div>

      <div className='flex items-center gap-3'>
        <UserX className='text-text-muted h-5 w-5' />
        <h1 className='text-xl font-bold'>퇴원 회원</h1>
        <span className='text-text-muted text-sm'>총 {total}명</span>
      </div>

      <Card className='p-4'>
        <div className='mb-4'>
          <SearchInput placeholder='이름 또는 이메일 검색' />
        </div>

        {rows.length === 0 ? (
          <div className='text-text-muted py-12 text-center'>퇴원 처리된 회원이 없습니다.</div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='text-text-muted border-b text-left text-xs uppercase'>
                <tr>
                  <th className='py-2 pr-3'>이름</th>
                  <th className='py-2 pr-3'>이메일</th>
                  <th className='py-2 pr-3'>구분</th>
                  <th className='py-2 pr-3'>지점</th>
                  <th className='py-2 pr-3'>퇴원일</th>
                  <th className='py-2 pr-3'>사유</th>
                  <th className='py-2'>관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className='border-b last:border-0'>
                    <td className='py-2 pr-3 font-medium'>{row.name}</td>
                    <td className='py-2 pr-3'>{row.email}</td>
                    <td className='py-2 pr-3'>{USER_TYPE_LABEL[row.user_type]}</td>
                    <td className='py-2 pr-3'>{row.branch_name ?? '-'}</td>
                    <td className='py-2 pr-3 whitespace-nowrap'>{formatDate(row.withdrawn_at)}</td>
                    <td className='max-w-xs truncate py-2 pr-3' title={row.withdrawn_reason ?? ''}>
                      {row.withdrawn_reason ?? '-'}
                    </td>
                    <td className='py-2'>
                      <div className='flex items-center gap-1.5'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setDetailTarget(row)}
                          className='gap-1'
                        >
                          <Eye className='h-3.5 w-3.5' />
                          상세
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            setRestoreTarget(row);
                            setConfirmName('');
                          }}
                          className='gap-1'
                        >
                          <RotateCcw className='h-3.5 w-3.5' />
                          복구
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className='mt-4 flex justify-center'>
            <Pagination
              total={total}
              page={Math.min(page, Math.max(1, Math.ceil(total / pageSize)))}
              pageSize={pageSize}
              pathname={pathname}
              searchParams={new URLSearchParams(sp.toString())}
            />
          </div>
        )}
      </Card>

      {restoreTarget && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <Card className='w-full max-w-md space-y-4 p-6'>
            <div className='flex items-center gap-2'>
              <RotateCcw className='h-5 w-5 text-blue-600' />
              <h2 className='text-lg font-semibold'>회원 복구</h2>
            </div>
            <p className='text-text-muted text-sm leading-relaxed'>
              <strong>{restoreTarget.name}</strong>({restoreTarget.email}) 회원을 복구합니다.
              <br />
              복구 시 다시 로그인 가능 상태가 되며, 학생 목록·출결 등 모든 활성 화면에 다시
              노출됩니다.
            </p>
            <div className='space-y-1'>
              <label className='text-sm font-medium'>확인을 위해 회원 이름을 입력해 주세요.</label>
              <input
                type='text'
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={restoreTarget.name}
                className='w-full rounded-md border px-3 py-2 text-sm'
              />
            </div>
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  setRestoreTarget(null);
                  setConfirmName('');
                }}
                disabled={loading}
              >
                취소
              </Button>
              <Button
                onClick={() => void handleRestore()}
                disabled={loading || confirmName.trim() !== restoreTarget.name.trim()}
              >
                {loading ? '복구 중...' : '복구하기'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {detailTarget && (
        <WithdrawnDetailModal target={detailTarget} onClose={() => setDetailTarget(null)} />
      )}
    </div>
  );
}
