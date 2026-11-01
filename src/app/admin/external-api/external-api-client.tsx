'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, KeyRound, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { copyText } from '@/lib/clipboard';
import {
  createExternalApiKey,
  revokeExternalApiKey,
  updateExternalApiKeyNameDisplay,
  type ExternalApiKey,
} from '@/lib/actions/external-api';

type NameDisplay = ExternalApiKey['name_display'];

const NAME_DISPLAY_OPTIONS = [
  { value: 'masked', label: '가운데 가림 (홍*동)' },
  { value: 'full', label: '실명 (홍길동)' },
];

function formatDateTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  initialKeys: ExternalApiKey[];
  branches: { id: string; name: string }[];
}

export default function ExternalApiClient({ initialKeys, branches }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [nameDisplay, setNameDisplay] = useState<NameDisplay>('masked');
  const [loading, setLoading] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ExternalApiKey | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    const result = await createExternalApiKey({ name, branchId, nameDisplay });
    setLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setIssuedKey(result.key);
    setShowForm(false);
    setName('');
    setBranchId('');
    setNameDisplay('masked');
    router.refresh();
  };

  const handleNameDisplay = async (id: string, value: NameDisplay) => {
    const result = await updateExternalApiKeyNameDisplay(id, value);
    if (!result.success) toast.error(result.error ?? '변경에 실패했습니다.');
    else toast.success('이름 표시 방식을 바꿨습니다.');
    router.refresh();
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setLoading(true);
    const result = await revokeExternalApiKey(revokeTarget.id);
    setLoading(false);
    setRevokeTarget(null);
    if (!result.success) toast.error(result.error ?? '폐기에 실패했습니다.');
    else toast.success('인증키를 폐기했습니다.');
    router.refresh();
  };

  return (
    <div className='space-y-6 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-gray-800'>외부 연동 API</h1>
          <p className='mt-1 text-gray-500'>
            사이니지 등 외부 업체가 학생 순위 데이터를 조회할 때 쓰는 인증키를 관리합니다.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className='flex items-center gap-2'>
          <Plus className='h-4 w-4' />
          인증키 발급
        </Button>
      </div>

      {issuedKey && (
        <Card className='border-amber-300 bg-amber-50 p-4'>
          <p className='font-semibold text-amber-900'>
            발급된 인증키 — 이 화면을 벗어나면 다시 볼 수 없습니다.
          </p>
          <p className='mt-1 text-sm text-amber-800'>
            지금 복사해 업체에 안전하게 전달해 주세요. 잃어버리면 폐기 후 새로 발급하면 됩니다.
          </p>
          <div className='mt-3 flex items-center gap-2'>
            <code className='flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-sm break-all'>
              {issuedKey}
            </code>
            <Button
              variant='outline'
              onClick={async () => {
                if (await copyText(issuedKey)) toast.success('복사했습니다.');
              }}
              className='flex items-center gap-1'
            >
              <Copy className='h-4 w-4' />
              복사
            </Button>
            <Button variant='outline' onClick={() => setIssuedKey(null)}>
              닫기
            </Button>
          </div>
        </Card>
      )}

      {showForm && (
        <Card className='p-4'>
          <h3 className='mb-4 font-semibold'>새 인증키 발급</h3>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-end'>
            <div className='flex-1'>
              <label className='mb-1 block text-sm font-medium text-gray-700'>업체명 *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='예: ○○사이니지 (반포점 모니터)'
              />
            </div>
            <div>
              <label className='mb-1 block text-sm font-medium text-gray-700'>조회 지점 *</label>
              <Select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                placeholder='지점 선택'
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
            <div>
              <label className='mb-1 block text-sm font-medium text-gray-700'>학생 이름 표시</label>
              <Select
                value={nameDisplay}
                onChange={(e) => setNameDisplay(e.target.value as NameDisplay)}
                options={NAME_DISPLAY_OPTIONS}
              />
            </div>
            <div className='flex gap-2'>
              <Button onClick={handleCreate} disabled={loading || !name.trim() || !branchId}>
                발급
              </Button>
              <Button variant='outline' onClick={() => setShowForm(false)}>
                취소
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className='overflow-x-auto p-0'>
        <table className='w-full min-w-[760px] text-sm'>
          <thead className='bg-gray-50 text-left text-gray-500'>
            <tr>
              <th className='px-4 py-3 font-medium'>업체명</th>
              <th className='px-4 py-3 font-medium'>지점</th>
              <th className='px-4 py-3 font-medium'>키</th>
              <th className='px-4 py-3 font-medium'>이름 표시</th>
              <th className='px-4 py-3 font-medium'>발급일</th>
              <th className='px-4 py-3 font-medium'>마지막 사용</th>
              <th className='px-4 py-3 font-medium'>상태</th>
            </tr>
          </thead>
          <tbody>
            {initialKeys.length === 0 && (
              <tr>
                <td colSpan={7} className='px-4 py-10 text-center text-gray-400'>
                  <KeyRound className='mx-auto mb-2 h-6 w-6' />
                  발급된 인증키가 없습니다.
                </td>
              </tr>
            )}
            {initialKeys.map((k) => {
              const revoked = !!k.revoked_at;
              return (
                <tr key={k.id} className={revoked ? 'text-gray-400' : 'text-gray-800'}>
                  <td className='border-t px-4 py-3 font-medium'>{k.name}</td>
                  <td className='border-t px-4 py-3'>{k.branch_name ?? '-'}</td>
                  <td className='border-t px-4 py-3 font-mono text-xs'>{k.key_prefix}…</td>
                  <td className='border-t px-4 py-3'>
                    {revoked ? (
                      k.name_display === 'full' ? (
                        '실명'
                      ) : (
                        '가운데 가림'
                      )
                    ) : (
                      <Select
                        value={k.name_display}
                        onChange={(e) => handleNameDisplay(k.id, e.target.value as NameDisplay)}
                        options={NAME_DISPLAY_OPTIONS}
                        className='py-1 text-xs'
                      />
                    )}
                  </td>
                  <td className='border-t px-4 py-3'>{formatDateTime(k.created_at)}</td>
                  <td className='border-t px-4 py-3'>{formatDateTime(k.last_used_at)}</td>
                  <td className='border-t px-4 py-3'>
                    {revoked ? (
                      <span>폐기됨 ({formatDateTime(k.revoked_at)})</span>
                    ) : (
                      <div className='flex items-center gap-2'>
                        <span className='rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700'>
                          사용 중
                        </span>
                        <button
                          type='button'
                          onClick={() => setRevokeTarget(k)}
                          className='text-xs text-red-500 hover:underline'
                        >
                          폐기
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <p className='text-xs text-gray-500'>
        호출 주소: <code>/api/external/v1/students</code>, <code>/points</code>,{' '}
        <code>/study-time</code> · 키당 분당 60회까지 · 응답은 발급 지점의 재원생으로 한정됩니다.
      </p>

      <ConfirmDialog
        open={!!revokeTarget}
        title='인증키를 폐기할까요?'
        description={`${revokeTarget?.name ?? ''}\n폐기하면 이 키로 들어오는 조회가 즉시 차단되며 되돌릴 수 없습니다.`}
        confirmText='폐기'
        danger
        loading={loading}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
