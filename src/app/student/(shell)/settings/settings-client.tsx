'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  User,
  Users,
  Key,
  Copy,
  Check,
  Edit2,
  X,
  Lock,
  LogOut,
  ChevronLeft,
  Mail,
  Phone,
  Calendar,
  Building2,
  GraduationCap,
  Hash,
  UserX,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import {
  updateStudentProfile,
  changePassword,
  withdrawSelf,
  type StudentProfileInfo,
  type LinkedParent,
} from '@/lib/actions/student';
import { SignOutForm } from '@/components/SignOutForm';
import { signOutWithNativeSync } from '@/lib/sign-out-app';
import type { StudentType } from '@/types/database';

interface SettingsClientProps {
  profile: StudentProfileInfo;
  linkedParents: LinkedParent[];
  studentTypes: StudentType[];
}

export function SettingsClient({ profile, linkedParents, studentTypes }: SettingsClientProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 프로필 수정 폼 상태
  const [editName, setEditName] = useState(profile.name);
  const [editPhone, setEditPhone] = useState(profile.phone || '');
  const [editStudentTypeId, setEditStudentTypeId] = useState(profile.studentTypeId || '');

  // 비밀번호 변경 폼 상태
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 회원 탈퇴 모달 상태
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawPassword, setWithdrawPassword] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  async function copyToClipboard() {
    await navigator.clipboard.writeText(profile.parentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCancelEdit() {
    setIsEditing(false);
    setEditName(profile.name);
    setEditPhone(profile.phone || '');
    setEditStudentTypeId(profile.studentTypeId || '');
    setError(null);
  }

  function handleSaveProfile() {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await updateStudentProfile({
        name: editName,
        phone: editPhone,
        studentTypeId: editStudentTypeId || null,
      });

      if (result.success) {
        setSuccess('프로필이 수정되었습니다.');
        setIsEditing(false);
        // 페이지 새로고침으로 최신 데이터 반영
        window.location.reload();
      } else {
        setError(result.error || '프로필 수정에 실패했습니다.');
      }
    });
  }

  function handleCancelPasswordChange() {
    setIsChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  }

  function handleChangePassword() {
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('모든 필드를 입력해주세요.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (newPassword.length < 6) {
      setError('새 비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    startTransition(async () => {
      const result = await changePassword(currentPassword, newPassword);

      if (result.success) {
        setSuccess('비밀번호가 변경되었습니다.');
        handleCancelPasswordChange();
      } else {
        setError(result.error || '비밀번호 변경에 실패했습니다.');
      }
    });
  }

  function handleOpenWithdraw() {
    setWithdrawPassword('');
    setWithdrawReason('');
    setWithdrawError(null);
    setIsWithdrawModalOpen(true);
  }

  function handleCloseWithdraw() {
    if (isPending) return;
    setIsWithdrawModalOpen(false);
    setWithdrawPassword('');
    setWithdrawReason('');
    setWithdrawError(null);
  }

  function handleConfirmWithdraw() {
    setWithdrawError(null);

    if (!withdrawPassword) {
      setWithdrawError('현재 비밀번호를 입력해주세요.');
      return;
    }

    startTransition(async () => {
      const result = await withdrawSelf(withdrawPassword, withdrawReason);

      if (result.success) {
        await signOutWithNativeSync();
      } else {
        setWithdrawError(result.error || '회원 탈퇴에 실패했습니다.');
      }
    });
  }

  return (
    <div className='space-y-6 p-4 pb-24'>
      {/* 헤더 */}
      <div className='flex items-center gap-3'>
        <Link href='/student' className='-ml-2 rounded-xl p-2 transition-colors hover:bg-gray-100'>
          <ChevronLeft className='text-text-muted h-5 w-5' />
        </Link>
        <div>
          <h1 className='text-text text-xl font-bold'>설정</h1>
          <p className='text-text-muted text-sm'>개인정보 및 계정 관리</p>
        </div>
      </div>

      {/* 성공/에러 메시지 */}
      {success && (
        <div className='bg-success/10 text-success rounded-xl p-3 text-center text-sm'>
          {success}
        </div>
      )}
      {error && (
        <div className='bg-error/10 text-error rounded-xl p-3 text-center text-sm'>{error}</div>
      )}

      {/* 학부모 연결 코드 섹션 */}
      <Card className='p-4'>
        <div className='mb-3 flex items-center gap-2'>
          <Key className='text-primary h-5 w-5' />
          <h2 className='text-text font-semibold'>학부모 연결 코드</h2>
        </div>
        <div className='rounded-xl bg-gray-50 p-4 text-center'>
          <div className='text-primary mb-3 text-3xl font-bold tracking-[0.3em]'>
            {profile.parentCode}
          </div>
          <Button variant='outline' size='sm' onClick={copyToClipboard} className='gap-2'>
            {copied ? (
              <>
                <Check className='h-4 w-4' />
                복사됨
              </>
            ) : (
              <>
                <Copy className='h-4 w-4' />
                코드 복사
              </>
            )}
          </Button>
        </div>
        <p className='text-text-muted mt-3 text-center text-xs'>
          학부모님이 회원가입 시 이 코드를 입력하면 계정이 연결됩니다.
        </p>
      </Card>

      {/* 내 정보 섹션 */}
      <Card className='p-4'>
        <div className='mb-4 flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <User className='text-primary h-5 w-5' />
            <h2 className='text-text font-semibold'>내 정보</h2>
          </div>
          {!isEditing ? (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setIsEditing(true)}
              className='text-text-muted gap-1'
            >
              <Edit2 className='h-4 w-4' />
              수정
            </Button>
          ) : (
            <div className='flex gap-2'>
              <Button variant='ghost' size='sm' onClick={handleCancelEdit} disabled={isPending}>
                <X className='h-4 w-4' />
              </Button>
              <Button size='sm' onClick={handleSaveProfile} disabled={isPending}>
                {isPending ? '저장 중...' : '저장'}
              </Button>
            </div>
          )}
        </div>

        <div className='space-y-3'>
          {/* 이름 */}
          <div className='flex items-center gap-3'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100'>
              <User className='text-text-muted h-4 w-4' />
            </div>
            <div className='flex-1'>
              <p className='text-text-muted text-xs'>이름</p>
              {isEditing ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className='mt-1'
                  disabled={isPending}
                />
              ) : (
                <p className='text-text text-sm font-medium'>{profile.name}</p>
              )}
            </div>
          </div>

          {/* 이메일 (읽기 전용) */}
          <div className='flex items-center gap-3'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100'>
              <Mail className='text-text-muted h-4 w-4' />
            </div>
            <div className='flex-1'>
              <p className='text-text-muted text-xs'>이메일</p>
              <p className='text-text text-sm font-medium'>{profile.email}</p>
            </div>
          </div>

          {/* 전화번호 */}
          <div className='flex items-center gap-3'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100'>
              <Phone className='text-text-muted h-4 w-4' />
            </div>
            <div className='flex-1'>
              <p className='text-text-muted text-xs'>전화번호</p>
              {isEditing ? (
                <Input
                  type='tel'
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder='전화번호를 입력하세요'
                  className='mt-1'
                  disabled={isPending}
                />
              ) : (
                <p className='text-text text-sm font-medium'>{profile.phone || '-'}</p>
              )}
            </div>
          </div>

          {/* 생년월일 (읽기 전용) */}
          <div className='flex items-center gap-3'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100'>
              <Calendar className='text-text-muted h-4 w-4' />
            </div>
            <div className='flex-1'>
              <p className='text-text-muted text-xs'>생년월일</p>
              <p className='text-text text-sm font-medium'>{profile.birthday || '-'}</p>
            </div>
          </div>

          {/* 지점 (읽기 전용) */}
          <div className='flex items-center gap-3'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100'>
              <Building2 className='text-text-muted h-4 w-4' />
            </div>
            <div className='flex-1'>
              <p className='text-text-muted text-xs'>지점</p>
              <p className='text-text text-sm font-medium'>{profile.branchName || '-'}</p>
            </div>
          </div>

          {/* 학생 유형 */}
          {(studentTypes.length > 0 || profile.studentTypeName) && (
            <div className='flex items-center gap-3'>
              <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100'>
                <GraduationCap className='text-text-muted h-4 w-4' />
              </div>
              <div className='flex-1'>
                <p className='text-text-muted text-xs'>학생 유형</p>
                {isEditing && studentTypes.length > 0 ? (
                  <select
                    value={editStudentTypeId}
                    onChange={(e) => setEditStudentTypeId(e.target.value)}
                    disabled={isPending}
                    className='focus:ring-primary mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:outline-none'
                  >
                    <option value=''>미지정</option>
                    {studentTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className='text-text text-sm font-medium'>{profile.studentTypeName || '-'}</p>
                )}
              </div>
            </div>
          )}

          {/* 좌석번호 (읽기 전용) */}
          {profile.seatNumber && (
            <div className='flex items-center gap-3'>
              <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100'>
                <Hash className='text-text-muted h-4 w-4' />
              </div>
              <div className='flex-1'>
                <p className='text-text-muted text-xs'>좌석번호</p>
                <p className='text-text text-sm font-medium'>{profile.seatNumber}번</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 연결된 학부모 섹션 */}
      <Card className='p-4'>
        <div className='mb-3 flex items-center gap-2'>
          <Users className='text-primary h-5 w-5' />
          <h2 className='text-text font-semibold'>연결된 학부모 ({linkedParents.length}명)</h2>
        </div>

        {linkedParents.length === 0 ? (
          <div className='py-6 text-center'>
            <div className='mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100'>
              <Users className='h-6 w-6 text-gray-400' />
            </div>
            <p className='text-text-muted text-sm'>연결된 학부모가 없습니다.</p>
            <p className='text-text-muted mt-1 text-xs'>위 연결 코드를 학부모님께 전달해주세요.</p>
          </div>
        ) : (
          <div className='space-y-2'>
            {linkedParents.map((parent) => (
              <div key={parent.id} className='flex items-center gap-3 rounded-xl bg-gray-50 p-3'>
                <div className='bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full'>
                  <User className='text-primary h-5 w-5' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='text-text font-medium'>{parent.name}</p>
                  <p className='text-text-muted truncate text-xs'>{parent.email}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 계정 관리 섹션 */}
      <Card className='p-4'>
        <div className='mb-4 flex items-center gap-2'>
          <Lock className='text-primary h-5 w-5' />
          <h2 className='text-text font-semibold'>계정 관리</h2>
        </div>

        {!isChangingPassword ? (
          <div className='space-y-2'>
            <Button
              variant='outline'
              className='w-full justify-start gap-3'
              onClick={() => setIsChangingPassword(true)}
            >
              <Lock className='h-4 w-4' />
              비밀번호 변경
            </Button>
            <SignOutForm>
              <Button
                type='submit'
                variant='outline'
                className='w-full justify-start gap-3 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600'
              >
                <LogOut className='h-4 w-4' />
                로그아웃
              </Button>
            </SignOutForm>
            <Button
              variant='outline'
              className='w-full justify-start gap-3 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'
              onClick={handleOpenWithdraw}
            >
              <UserX className='h-4 w-4' />
              회원 탈퇴
            </Button>
          </div>
        ) : (
          <div className='space-y-3'>
            <div>
              <label className='text-text-muted text-xs'>현재 비밀번호</label>
              <Input
                type='password'
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder='현재 비밀번호'
                className='mt-1'
                disabled={isPending}
              />
            </div>
            <div>
              <label className='text-text-muted text-xs'>새 비밀번호</label>
              <Input
                type='password'
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder='새 비밀번호 (6자 이상)'
                className='mt-1'
                disabled={isPending}
              />
            </div>
            <div>
              <label className='text-text-muted text-xs'>새 비밀번호 확인</label>
              <Input
                type='password'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder='새 비밀번호 확인'
                className='mt-1'
                disabled={isPending}
              />
            </div>
            <div className='flex gap-2 pt-2'>
              <Button
                variant='outline'
                className='flex-1'
                onClick={handleCancelPasswordChange}
                disabled={isPending}
              >
                취소
              </Button>
              <Button className='flex-1' onClick={handleChangePassword} disabled={isPending}>
                {isPending ? '변경 중...' : '변경하기'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 회원 탈퇴 모달 */}
      {isWithdrawModalOpen && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4'
          onClick={handleCloseWithdraw}
        >
          <div
            className='w-full max-w-md rounded-2xl bg-white p-6 shadow-xl'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='mb-4 flex items-center gap-3'>
              <div className='flex h-12 w-12 items-center justify-center rounded-full bg-red-100'>
                <AlertTriangle className='h-6 w-6 text-red-600' />
              </div>
              <div>
                <h3 className='text-text text-lg font-bold'>회원 탈퇴</h3>
                <p className='text-text-muted text-xs'>정말 탈퇴하시겠어요?</p>
              </div>
            </div>

            <div className='text-text-muted mb-4 space-y-2 rounded-xl bg-gray-50 p-3 text-xs'>
              <p>· 탈퇴 후 본 계정으로 다시 로그인할 수 없습니다.</p>
              <p>· 출결·결제·학습 기록은 학원 운영을 위해 일정 기간 보존됩니다.</p>
              <p>· 복구가 필요하면 다니던 지점 데스크에 문의해 주세요.</p>
            </div>

            <div className='space-y-3'>
              <div>
                <label className='text-text-muted text-xs'>현재 비밀번호</label>
                <Input
                  type='password'
                  value={withdrawPassword}
                  onChange={(e) => setWithdrawPassword(e.target.value)}
                  placeholder='현재 비밀번호'
                  className='mt-1'
                  disabled={isPending}
                />
              </div>
              <div>
                <label className='text-text-muted text-xs'>탈퇴 사유 (선택)</label>
                <Input
                  type='text'
                  value={withdrawReason}
                  onChange={(e) => setWithdrawReason(e.target.value)}
                  placeholder='개선에 참고하겠습니다'
                  className='mt-1'
                  disabled={isPending}
                />
              </div>
              {withdrawError && (
                <div className='bg-error/10 text-error rounded-xl p-3 text-center text-sm'>
                  {withdrawError}
                </div>
              )}
              <div className='flex gap-2 pt-2'>
                <Button
                  variant='outline'
                  className='flex-1'
                  onClick={handleCloseWithdraw}
                  disabled={isPending}
                >
                  취소
                </Button>
                <Button
                  className='flex-1 bg-red-600 text-white hover:bg-red-700'
                  onClick={handleConfirmWithdraw}
                  disabled={isPending}
                >
                  {isPending ? '처리 중...' : '탈퇴 확정'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
