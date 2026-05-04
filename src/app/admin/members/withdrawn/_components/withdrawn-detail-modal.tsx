'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  getStudentDetail,
  getWithdrawnAdminDetail,
  getWithdrawnParentDetail,
  type WithdrawnAdminDetail,
  type WithdrawnMemberRow,
  type WithdrawnParentDetail,
} from '@/lib/actions/admin';
import {
  Award,
  BookOpen,
  Brain,
  Building2,
  Calendar,
  Loader2,
  Mail,
  Phone,
  User,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';

type StudentDetail = NonNullable<Awaited<ReturnType<typeof getStudentDetail>>>;

interface Props {
  target: WithdrawnMemberRow;
  onClose: () => void;
}

const USER_TYPE_LABEL: Record<WithdrawnMemberRow['user_type'], string> = {
  student: '학생',
  parent: '학부모',
  admin: '관리자',
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WithdrawnDetailModal({ target, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentDetail | null>(null);
  const [parentDetail, setParentDetail] = useState<WithdrawnParentDetail | null>(null);
  const [adminDetail, setAdminDetail] = useState<WithdrawnAdminDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStudentDetail(null);
    setParentDetail(null);
    setAdminDetail(null);

    const load = async () => {
      try {
        if (target.user_type === 'student') {
          const data = await getStudentDetail(target.id);
          if (cancelled) return;
          if (!data) {
            setError('학생 정보를 불러오지 못했습니다.');
          } else {
            setStudentDetail(data);
          }
        } else if (target.user_type === 'parent') {
          const data = await getWithdrawnParentDetail(target.id);
          if (cancelled) return;
          if (!data) {
            setError('학부모 정보를 불러오지 못했습니다.');
          } else {
            setParentDetail(data);
          }
        } else {
          const data = await getWithdrawnAdminDetail(target.id);
          if (cancelled) return;
          if (!data) {
            setError('관리자 정보를 불러오지 못했습니다.');
          } else {
            setAdminDetail(data);
          }
        }
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to load withdrawn member detail', e);
        setError('정보 조회 중 오류가 발생했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [target.id, target.user_type]);

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
      onClick={onClose}
    >
      <Card
        className='max-h-[90vh] w-full max-w-lg overflow-y-auto p-6'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mb-4 flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <h2 className='text-lg font-semibold'>퇴원 회원 상세</h2>
            <span className='inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600'>
              {USER_TYPE_LABEL[target.user_type]}
            </span>
            <span className='inline-flex items-center rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600'>
              퇴원
            </span>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='text-text-muted hover:text-text'
            aria-label='닫기'
          >
            <X className='h-5 w-5' />
          </button>
        </div>

        {loading ? (
          <div className='flex items-center justify-center py-16'>
            <Loader2 className='h-6 w-6 animate-spin text-gray-400' />
          </div>
        ) : error ? (
          <div className='py-12 text-center text-sm text-red-500'>{error}</div>
        ) : target.user_type === 'student' && studentDetail ? (
          <StudentBody detail={studentDetail} />
        ) : target.user_type === 'parent' && parentDetail ? (
          <ParentBody detail={parentDetail} />
        ) : target.user_type === 'admin' && adminDetail ? (
          <AdminBody detail={adminDetail} />
        ) : null}
      </Card>
    </div>
  );
}

function WithdrawnMetaBox({
  withdrawnAt,
  withdrawnByName,
  withdrawnReason,
}: {
  withdrawnAt: string | null;
  withdrawnByName: string | null;
  withdrawnReason: string | null;
}) {
  return (
    <div className='rounded-xl bg-gray-50 p-3'>
      <div className='mb-2 flex items-center gap-1 text-sm font-medium'>
        <UserX className='h-4 w-4 text-red-500' />
        퇴원 정보
      </div>
      <dl className='space-y-1 text-xs'>
        <div className='flex justify-between'>
          <dt className='text-text-muted'>퇴원일</dt>
          <dd>{formatDateTime(withdrawnAt)}</dd>
        </div>
        <div className='flex justify-between'>
          <dt className='text-text-muted'>처리자</dt>
          <dd>{withdrawnByName ?? '-'}</dd>
        </div>
        <div>
          <dt className='text-text-muted mb-0.5'>사유</dt>
          <dd className='whitespace-pre-wrap'>{withdrawnReason || '-'}</dd>
        </div>
      </dl>
    </div>
  );
}

function StudentBody({ detail }: { detail: StudentDetail }) {
  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-4'>
        <div className='bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full'>
          <User className='text-primary h-8 w-8' />
        </div>
        <div>
          <h3 className='text-xl font-bold'>{detail.name}</h3>
          <p className='text-text-muted'>좌석 {detail.seatNumber || '미배정'}번</p>
        </div>
      </div>

      <div className='space-y-2 border-t pt-4'>
        <Row label='좌석 번호' value={detail.seatNumber ? String(detail.seatNumber) : '-'} />
        <Row
          label='CAPS ID'
          value={
            <code
              className={
                detail.capsId
                  ? 'bg-primary/10 text-primary rounded px-2 py-0.5 text-sm'
                  : 'text-text-muted rounded bg-gray-100 px-2 py-0.5 text-sm'
              }
            >
              {detail.capsId || '미설정'}
            </code>
          }
        />
        <Row
          label='학생 타입'
          value={
            <span
              className={
                detail.studentType
                  ? 'bg-secondary/10 text-secondary rounded px-2 py-0.5 text-sm font-medium'
                  : 'text-text-muted rounded bg-gray-100 px-2 py-0.5 text-sm'
              }
            >
              {detail.studentType?.name || '미지정'}
            </span>
          }
        />
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Mail className='h-4 w-4' /> 이메일
            </span>
          }
          value={detail.email}
        />
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Phone className='h-4 w-4' /> 전화번호
            </span>
          }
          value={detail.phone || '-'}
        />
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Calendar className='h-4 w-4' /> 가입일
            </span>
          }
          value={formatDateTime(detail.createdAt)}
        />
        <Row
          label='연결 코드'
          value={<code className='rounded bg-gray-100 px-2 py-1 text-sm'>{detail.parentCode}</code>}
        />
      </div>

      <div className='border-t pt-4'>
        <h4 className='mb-2 flex items-center gap-1 text-sm font-medium'>
          <UserCheck className='text-secondary h-4 w-4' />
          연결된 학부모
          {detail.parents && detail.parents.length > 1 && (
            <span className='bg-secondary/10 text-secondary ml-1 rounded-full px-1.5 py-0.5 text-xs font-normal'>
              {detail.parents.length}명
            </span>
          )}
        </h4>
        {!detail.parents || detail.parents.length === 0 ? (
          <p className='rounded-xl bg-gray-50 p-3 text-sm text-gray-400'>미연결</p>
        ) : (
          <div className='space-y-2'>
            {detail.parents.map((p, idx) => (
              <div key={p.id || idx} className='rounded-xl bg-gray-50 p-3'>
                <div className='mb-1.5 flex items-center gap-2'>
                  <div className='bg-secondary/10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full'>
                    <UserCheck className='text-secondary h-3.5 w-3.5' />
                  </div>
                  <p className='text-sm font-medium'>{p.name}</p>
                </div>
                <div className='space-y-0.5 pl-8'>
                  <p className='text-text-muted flex items-center gap-1 text-xs'>
                    <Mail className='h-3 w-3' /> {p.email}
                  </p>
                  <p className='text-text-muted flex items-center gap-1 text-xs'>
                    <Phone className='h-3 w-3' /> {p.phone || '-'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className='border-t pt-4'>
        <h4 className='mb-3 text-sm font-medium'>최근 30일 통계</h4>
        <div className='grid grid-cols-2 gap-3'>
          <div className='bg-primary/10 rounded-xl p-3 text-center'>
            <BookOpen className='text-primary mx-auto mb-1 h-5 w-5' />
            <p className='text-primary text-2xl font-bold'>{detail.stats.attendanceDays}</p>
            <p className='text-text-muted text-xs'>출석일</p>
          </div>
          <div className='bg-secondary/10 rounded-xl p-3 text-center'>
            <Brain className='text-secondary mx-auto mb-1 h-5 w-5' />
            <p className='text-secondary text-2xl font-bold'>{detail.stats.avgFocus ?? '-'}</p>
            <p className='text-text-muted text-xs'>평균 몰입도</p>
          </div>
          <div className='bg-success/20 rounded-xl p-3 text-center'>
            <Award className='mx-auto mb-1 h-5 w-5 text-green-600' />
            <p className='text-2xl font-bold text-green-600'>+{detail.stats.totalReward}</p>
            <p className='text-text-muted text-xs'>상점</p>
          </div>
          <div className='bg-error/20 rounded-xl p-3 text-center'>
            <Award className='mx-auto mb-1 h-5 w-5 text-red-500' />
            <p className='text-2xl font-bold text-red-500'>-{detail.stats.totalPenalty}</p>
            <p className='text-text-muted text-xs'>벌점</p>
          </div>
        </div>
      </div>

      <div className='border-t pt-4'>
        <WithdrawnMetaBox
          withdrawnAt={detail.withdrawnAt}
          withdrawnByName={detail.withdrawnByName}
          withdrawnReason={detail.withdrawnReason}
        />
      </div>
    </div>
  );
}

function ParentBody({ detail }: { detail: WithdrawnParentDetail }) {
  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-4'>
        <div className='bg-secondary/10 flex h-16 w-16 items-center justify-center rounded-full'>
          <UserCheck className='text-secondary h-8 w-8' />
        </div>
        <div>
          <h3 className='text-xl font-bold'>{detail.name}</h3>
          <p className='text-text-muted text-sm'>{detail.branchName ?? '지점 미지정'}</p>
        </div>
      </div>

      <div className='space-y-2 border-t pt-4'>
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Mail className='h-4 w-4' /> 이메일
            </span>
          }
          value={detail.email}
        />
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Phone className='h-4 w-4' /> 전화번호
            </span>
          }
          value={detail.phone || '-'}
        />
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Building2 className='h-4 w-4' /> 지점
            </span>
          }
          value={detail.branchName ?? '-'}
        />
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Calendar className='h-4 w-4' /> 가입일
            </span>
          }
          value={formatDateTime(detail.createdAt)}
        />
      </div>

      <div className='border-t pt-4'>
        <h4 className='mb-2 flex items-center gap-1 text-sm font-medium'>
          <User className='text-primary h-4 w-4' />
          연결된 자녀
          {detail.children.length > 0 && (
            <span className='bg-primary/10 text-primary ml-1 rounded-full px-1.5 py-0.5 text-xs font-normal'>
              {detail.children.length}명
            </span>
          )}
        </h4>
        {detail.children.length === 0 ? (
          <p className='rounded-xl bg-gray-50 p-3 text-sm text-gray-400'>연결된 자녀가 없습니다.</p>
        ) : (
          <div className='space-y-2'>
            {detail.children.map((c) => (
              <div key={c.id} className='rounded-xl bg-gray-50 p-3'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <div className='bg-primary/10 flex h-6 w-6 items-center justify-center rounded-full'>
                      <User className='text-primary h-3.5 w-3.5' />
                    </div>
                    <p className='text-sm font-medium'>{c.name}</p>
                    {c.withdrawnAt && (
                      <span className='inline-flex items-center rounded-md bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-700'>
                        퇴원
                      </span>
                    )}
                  </div>
                  <span className='text-text-muted text-xs'>
                    {c.branchName ?? '-'} · 좌석 {c.seatNumber ?? '-'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className='border-t pt-4'>
        <WithdrawnMetaBox
          withdrawnAt={detail.withdrawnAt}
          withdrawnByName={detail.withdrawnByName}
          withdrawnReason={detail.withdrawnReason}
        />
      </div>
    </div>
  );
}

function AdminBody({ detail }: { detail: WithdrawnAdminDetail }) {
  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-4'>
        <div className='flex h-16 w-16 items-center justify-center rounded-full bg-amber-100'>
          <UserCheck className='h-8 w-8 text-amber-600' />
        </div>
        <div>
          <h3 className='text-xl font-bold'>{detail.name}</h3>
          <p className='text-text-muted text-sm'>{detail.branchName ?? '지점 미지정'}</p>
        </div>
      </div>

      <div className='space-y-2 border-t pt-4'>
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Mail className='h-4 w-4' /> 이메일
            </span>
          }
          value={detail.email}
        />
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Phone className='h-4 w-4' /> 전화번호
            </span>
          }
          value={detail.phone || '-'}
        />
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Building2 className='h-4 w-4' /> 지점
            </span>
          }
          value={detail.branchName ?? '-'}
        />
        <Row
          label={
            <span className='flex items-center gap-1'>
              <Calendar className='h-4 w-4' /> 가입일
            </span>
          }
          value={formatDateTime(detail.createdAt)}
        />
      </div>

      <div className='border-t pt-4'>
        <WithdrawnMetaBox
          withdrawnAt={detail.withdrawnAt}
          withdrawnByName={detail.withdrawnByName}
          withdrawnReason={detail.withdrawnReason}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between'>
      <span className='text-text-muted text-sm'>{label}</span>
      <span className='text-sm'>{value}</span>
    </div>
  );
}
