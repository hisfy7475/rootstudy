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
} from 'lucide-react';
import Link from 'next/link';
import {
  updateStudentProfile,
  changePassword,
  type StudentProfileInfo,
  type LinkedParent,
} from '@/lib/actions/student';
import { signOut } from '@/app/(auth)/actions';
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

  return (
    <div className="p-4 pb-24 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href="/student"
          className="p-2 -ml-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-text">설정</h1>
          <p className="text-sm text-text-muted">개인정보 및 계정 관리</p>
        </div>
      </div>

      {/* 성공/에러 메시지 */}
      {success && (
        <div className="p-3 rounded-xl bg-success/10 text-success text-sm text-center">
          {success}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-error/10 text-error text-sm text-center">
          {error}
        </div>
      )}

      {/* 학부모 연결 코드 섹션 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-text">학부모 연결 코드</h2>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold tracking-[0.3em] text-primary mb-3">
            {profile.parentCode}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                복사됨
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                코드 복사
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-text-muted mt-3 text-center">
          학부모님이 회원가입 시 이 코드를 입력하면 계정이 연결됩니다.
        </p>
      </Card>

      {/* 내 정보 섹션 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-text">내 정보</h2>
          </div>
          {!isEditing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="gap-1 text-text-muted"
            >
              <Edit2 className="w-4 h-4" />
              수정
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelEdit}
                disabled={isPending}
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={handleSaveProfile}
                disabled={isPending}
              >
                {isPending ? '저장 중...' : '저장'}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {/* 이름 */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <User className="w-4 h-4 text-text-muted" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-text-muted">이름</p>
              {isEditing ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1"
                  disabled={isPending}
                />
              ) : (
                <p className="text-sm font-medium text-text">{profile.name}</p>
              )}
            </div>
          </div>

          {/* 이메일 (읽기 전용) */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <Mail className="w-4 h-4 text-text-muted" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-text-muted">이메일</p>
              <p className="text-sm font-medium text-text">{profile.email}</p>
            </div>
          </div>

          {/* 전화번호 */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <Phone className="w-4 h-4 text-text-muted" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-text-muted">전화번호</p>
              {isEditing ? (
                <Input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="전화번호를 입력하세요"
                  className="mt-1"
                  disabled={isPending}
                />
              ) : (
                <p className="text-sm font-medium text-text">
                  {profile.phone || '-'}
                </p>
              )}
            </div>
          </div>

          {/* 생년월일 (읽기 전용) */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-text-muted" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-text-muted">생년월일</p>
              <p className="text-sm font-medium text-text">
                {profile.birthday || '-'}
              </p>
            </div>
          </div>

          {/* 지점 (읽기 전용) */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-text-muted" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-text-muted">지점</p>
              <p className="text-sm font-medium text-text">
                {profile.branchName || '-'}
              </p>
            </div>
          </div>

          {/* 학생 유형 */}
          {(studentTypes.length > 0 || profile.studentTypeName) && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-text-muted" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-text-muted">학생 유형</p>
                {isEditing && studentTypes.length > 0 ? (
                  <select
                    value={editStudentTypeId}
                    onChange={(e) => setEditStudentTypeId(e.target.value)}
                    disabled={isPending}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary text-sm text-gray-800 bg-white"
                  >
                    <option value="">미지정</option>
                    {studentTypes.map(type => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm font-medium text-text">
                    {profile.studentTypeName || '-'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 좌석번호 (읽기 전용) */}
          {profile.seatNumber && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <Hash className="w-4 h-4 text-text-muted" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-text-muted">좌석번호</p>
                <p className="text-sm font-medium text-text">
                  {profile.seatNumber}번
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 연결된 학부모 섹션 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-text">
            연결된 학부모 ({linkedParents.length}명)
          </h2>
        </div>

        {linkedParents.length === 0 ? (
          <div className="py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-text-muted">연결된 학부모가 없습니다.</p>
            <p className="text-xs text-text-muted mt-1">
              위 연결 코드를 학부모님께 전달해주세요.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {linkedParents.map((parent) => (
              <div
                key={parent.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text">{parent.name}</p>
                  <p className="text-xs text-text-muted truncate">
                    {parent.email}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 계정 관리 섹션 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-text">계정 관리</h2>
        </div>

        {!isChangingPassword ? (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={() => setIsChangingPassword(true)}
            >
              <Lock className="w-4 h-4" />
              비밀번호 변경
            </Button>
            <form action={signOut}>
              <Button
                type="submit"
                variant="outline"
                className="w-full justify-start gap-3 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
              >
                <LogOut className="w-4 h-4" />
                로그아웃
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-muted">현재 비밀번호</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="현재 비밀번호"
                className="mt-1"
                disabled={isPending}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">새 비밀번호</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="새 비밀번호 (6자 이상)"
                className="mt-1"
                disabled={isPending}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">새 비밀번호 확인</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="새 비밀번호 확인"
                className="mt-1"
                disabled={isPending}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancelPasswordChange}
                disabled={isPending}
              >
                취소
              </Button>
              <Button
                className="flex-1"
                onClick={handleChangePassword}
                disabled={isPending}
              >
                {isPending ? '변경 중...' : '변경하기'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
