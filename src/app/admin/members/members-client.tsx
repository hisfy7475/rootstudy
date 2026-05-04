'use client';

import { useState, useMemo, useCallback, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import { buildListHref } from '@/lib/list-params';
import {
  getStudentDetail,
  updateMember,
  updateStudentSeat,
  updateStudentCapsId,
  updateAdminBranch,
  updateStudentType,
  rejectStudent,
  updateStudentApprovalStatus,
  type MembersAggregates,
} from '@/lib/actions/admin';
import { getStudentTypes } from '@/lib/actions/student-type';
import { DeleteMemberModal } from './_components/delete-member-modal';
import { DeleteAdminModal } from './_components/delete-admin-modal';
import { AddAdminModal } from './_components/add-admin-modal';
import { ApprovalModal } from './_components/approval-modal';
import { ResetAdminPasswordModal } from './_components/reset-admin-password-modal';
import { setAdminSuperFlag } from '@/lib/actions/admin';
import {
  User,
  UserCheck,
  Edit3,
  Eye,
  X,
  Check,
  Phone,
  Mail,
  Calendar,
  Award,
  Brain,
  BookOpen,
  Shield,
  Building2,
  UserPlus,
  UserMinus,
  Clock,
  CheckCircle2,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  UserX,
  Key,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  user_type: string;
  is_approved: boolean;
  is_rejected?: boolean;
  created_at: string;
  branch_id: string | null;
  branch_name: string | null;
  seat_number: number | null;
  school: string | null;
  grade: number | null;
  student_type_id: string | null;
  parents: { id: string; name: string; phone: string | null }[];
}

interface ParentMember {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  user_type: string;
  created_at: string;
  students: {
    id: string;
    name: string;
    seatNumber: number | null;
    branchName: string | null;
  }[];
}

interface Admin {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  branch_id: string | null;
  branch_name: string | null;
  is_super_admin: boolean;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
}

interface StudentType {
  id: string;
  name: string;
  weeklyGoalHours: number;
}

interface StudentDetail {
  id: string;
  seatNumber: number | null;
  parentCode: string;
  capsId: string | null;
  studentTypeId: string | null;
  studentType: StudentType | null;
  branchId: string | null;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  parents: {
    id: string;
    name: string;
    email: string;
    phone: string;
  }[];
  parent: {
    id: string;
    name: string;
    email: string;
    phone: string;
  } | null;
  stats: {
    attendanceDays: number;
    avgFocus: number | null;
    totalReward: number;
    totalPenalty: number;
  };
}

export type StudentTypeFilterValue = 'all' | 'unassigned' | string;

type ApprovalFilter = 'all' | 'pending' | 'approved' | 'rejected';
type SortField = 'seat_number' | 'name' | 'branch_name' | 'created_at';

interface MembersClientProps {
  students: Member[];
  studentsTotal: number;
  parents: ParentMember[];
  parentsTotal: number;
  admins: Admin[];
  adminsTotal: number;
  page: number;
  pageSize: number;
  sort: SortField;
  dir: 'asc' | 'desc';
  branches: Branch[];
  studentTypes?: StudentTypeOption[];
  branchId?: string | null;
  studentTypeFilter?: StudentTypeFilterValue;
  tab?: Tab;
  approval?: ApprovalFilter;
  q?: string;
  aggregates: MembersAggregates;
  /** 현재 로그인한 어드민이 슈퍼관리자인지. 슈퍼 전용 액션·UI 게이트에 사용. */
  currentIsSuperAdmin: boolean;
}

type Tab = 'students' | 'parents' | 'admins';

interface StudentTypeOption {
  id: string;
  name: string;
}

export function MembersClient({
  students,
  studentsTotal,
  parents,
  parentsTotal,
  admins,
  adminsTotal,
  page,
  pageSize,
  sort,
  dir,
  branches,
  studentTypes: allStudentTypes = [],
  studentTypeFilter = 'all',
  tab: activeTab = 'students',
  approval: studentFilter = 'all',
  aggregates,
  currentIsSuperAdmin,
}: MembersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  // 학생 행이 자체적으로 parents 를 들고 있으므로 students 에서 직접 매핑.
  const studentParentMap = useMemo(() => {
    const map: Record<string, { id: string; name: string; phone: string | null }[]> = {};
    for (const s of students) {
      if (s.parents && s.parents.length > 0) map[s.id] = s.parents;
    }
    return map;
  }, [students]);
  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);
  const [studentTypes, setStudentTypes] = useState<StudentTypeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // URL 동기화 헬퍼 — 필터·탭·검색어 변경 시 호출
  const patchUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const href = buildListHref(pathname, new URLSearchParams(sp.toString()), patch);
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [pathname, sp, router],
  );

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const handleTabChange = useCallback(
    (next: Tab) => {
      setSelectedStudent(null);
      // 탭 전환 시 q/page/sort/dir/approval/studentType 모두 초기화 — 탭별 의미가 다름
      patchUrl({
        tab: next,
        page: null,
        sort: null,
        dir: null,
        approval: null,
        studentType: null,
      });
    },
    [patchUrl],
  );

  const handleApprovalFilterChange = useCallback(
    (v: ApprovalFilter) => {
      patchUrl({ approval: v === 'all' ? null : v, page: null });
    },
    [patchUrl],
  );
  // 인라인 이름 편집 상태
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  // 모달 타겟 — 입력 state는 각 모달 컴포넌트가 자체 보유 (리렌더 격리)
  const [approvalTarget, setApprovalTarget] = useState<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    member: { id: string; name: string; email: string };
    userType: 'student' | 'parent';
  } | null>(null);
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [deleteAdminTarget, setDeleteAdminTarget] = useState<Admin | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<Admin | null>(null);

  // 카운트는 서버 aggregates 기반 (검색·필터와 무관한 branch 전체 기준)
  const pendingCount = aggregates.approval.pending;
  const approvedCount = aggregates.approval.approved;
  const rejectedCount = aggregates.approval.rejected;
  const unassignedStudentCount = aggregates.unassignedStudentCount;

  const handleStudentTypeFilterChange = useCallback(
    (value: StudentTypeFilterValue) => {
      patchUrl({
        studentType: value === 'all' ? null : value === 'unassigned' ? 'unassigned' : value,
        page: null,
      });
    },
    [patchUrl],
  );

  // 정렬 토글 — 같은 컬럼 클릭 시 방향 토글, 다른 컬럼은 asc 시작
  const handleSort = (field: 'seat_number' | 'name' | 'branch_name') => {
    let nextDir: 'asc' | 'desc' = 'asc';
    if (sort === field) {
      nextDir = dir === 'asc' ? 'desc' : 'asc';
    }
    patchUrl({ sort: field, dir: nextDir, page: null });
  };

  const renderSortIcon = (field: 'seat_number' | 'name' | 'branch_name') => {
    if (sort !== field) {
      return <ArrowUpDown className='text-text-muted h-3.5 w-3.5' />;
    }
    return dir === 'asc' ? (
      <ArrowUp className='text-primary h-3.5 w-3.5' />
    ) : (
      <ArrowDown className='text-primary h-3.5 w-3.5' />
    );
  };

  // 관리자 지점 변경
  const handleBranchChange = async (adminId: string, newBranchId: string) => {
    setLoading(true);
    try {
      const result = await updateAdminBranch(adminId, newBranchId || null);
      if (result.success) {
        refresh();
      } else if (result.error) {
        alert(result.error);
      }
    } catch (error) {
      console.error('Failed to update branch:', error);
    } finally {
      setLoading(false);
    }
  };

  // 슈퍼관리자 권한 토글 (슈퍼관리자만 호출 가능)
  const handleToggleSuperAdmin = async (admin: Admin) => {
    const next = !admin.is_super_admin;
    const action = next ? '최고 관리자 권한을 부여' : '최고 관리자 권한을 회수';
    if (!confirm(`${admin.name} 어드민에게 ${action}하시겠습니까?`)) return;
    setLoading(true);
    try {
      const result = await setAdminSuperFlag(admin.id, next);
      if (result.success) {
        refresh();
      } else if (result.error) {
        alert(result.error);
      }
    } catch (error) {
      console.error('Failed to toggle super flag:', error);
      alert('권한 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (studentId: string) => {
    setLoading(true);
    try {
      const detail = await getStudentDetail(studentId);
      setSelectedStudent(detail);

      // 학생 타입 목록 로드 (지점 무관)
      const types = await getStudentTypes();
      setStudentTypes(types.map((t) => ({ id: t.id, name: t.name })));
    } catch (error) {
      console.error('Failed to fetch student detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (id: string, field: string, currentValue: string | number | null) => {
    setEditMode({ id, field });
    setEditValue(String(currentValue || ''));
  };

  const handleSaveEdit = async () => {
    if (!editMode) return;

    setLoading(true);
    try {
      if (editMode.field === 'seatNumber') {
        await updateStudentSeat(editMode.id, editValue ? parseInt(editValue) : null);
      } else if (editMode.field === 'capsId') {
        await updateStudentCapsId(editMode.id, editValue || null);
      } else if (editMode.field === 'studentTypeId') {
        await updateStudentType(editMode.id, editValue || null);
      } else {
        await updateMember(editMode.id, { [editMode.field]: editValue });
      }

      refresh();

      // 상세 정보 새로고침
      if (selectedStudent && editMode.id === selectedStudent.id) {
        const detail = await getStudentDetail(editMode.id);
        setSelectedStudent(detail);
      }
    } catch (error) {
      console.error('Failed to update:', error);
    } finally {
      setLoading(false);
      setEditMode(null);
      setEditValue('');
    }
  };

  // 승인 모달 열기
  const handleOpenApproval = (student: Member) => {
    setApprovalTarget({
      id: student.id,
      name: student.name,
      email: student.email,
      phone: student.phone,
    });
  };

  // 비승인 처리
  const handleReject = async (studentId: string) => {
    if (!confirm('이 학생을 비승인 처리하시겠습니까?')) return;

    setLoading(true);
    try {
      const result = await rejectStudent(studentId);

      if (result.success) {
        refresh();
      } else {
        alert(result.error || '비승인에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to reject student:', error);
      alert('비승인 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 승인 상태 직접 변경 (셀 드롭다운)
  const handleUpdateApprovalStatus = async (
    memberId: string,
    status: 'approved' | 'pending' | 'rejected',
  ) => {
    setLoading(true);
    try {
      const result = await updateStudentApprovalStatus(memberId, status);
      if (result.success) {
        refresh();
      } else {
        alert(result.error || '승인 상태 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to update approval status:', error);
      alert('승인 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 센터(branch) 직접 변경 (셀 드롭다운)
  const handleUpdateStudentBranch = async (memberId: string, newBranchId: string) => {
    setLoading(true);
    try {
      const result = await updateMember(memberId, { branch_id: newBranchId || null });
      if (result.error) {
        alert('센터 변경에 실패했습니다: ' + result.error);
        return;
      }
      refresh();
    } catch (error) {
      console.error('Failed to update branch:', error);
      alert('센터 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 탈퇴 모달 열기
  const handleOpenDeleteModal = (member: Member | ParentMember, userType: 'student' | 'parent') => {
    setDeleteTarget({
      member: { id: member.id, name: member.name, email: member.email },
      userType,
    });
  };

  // 이름 수정 핸들러
  const handleStartEditName = (member: Member) => {
    setEditingNameId(member.id);
    setEditingNameValue(member.name);
  };

  const handleSaveNameEdit = async (memberId: string) => {
    if (!editingNameValue.trim()) return;

    setLoading(true);
    try {
      await updateMember(memberId, { name: editingNameValue.trim() });
      refresh();
    } catch (error) {
      console.error('Failed to update name:', error);
    } finally {
      setLoading(false);
      setEditingNameId(null);
      setEditingNameValue('');
    }
  };

  // 학생 타입 인라인 수정 핸들러
  const handleUpdateStudentTypeInline = async (memberId: string, studentTypeId: string) => {
    setLoading(true);
    try {
      const result = await updateStudentType(memberId, studentTypeId || null);

      if (result.error) {
        console.error('Failed to update student type:', result.error);
        alert('학생 타입 수정에 실패했습니다: ' + result.error);
        return;
      }
      refresh();
    } catch (error) {
      console.error('Failed to update student type:', error);
      alert('학생 타입 수정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 학교 수정 핸들러
  const handleUpdateStudentField = async (memberId: string, field: 'school', value: string) => {
    setLoading(true);
    try {
      const updateData: { school?: string | null } = {};
      if (field === 'school') {
        updateData.school = value || null;
      }

      const result = await updateMember(memberId, updateData);

      if (result.error) {
        console.error(`Failed to update ${field}:`, result.error);
        alert('학교 수정에 실패했습니다: ' + result.error);
        return;
      }
      refresh();
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
      alert('학교 수정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className='space-y-6 p-6'>
      {/* 헤더 */}
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold'>회원 관리</h1>
          <p className='text-text-muted mt-1'>학생, 학부모, 관리자 회원을 관리하세요</p>
        </div>
        <a
          href='/admin/members/withdrawn'
          className='text-text-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50'
        >
          <UserX className='h-4 w-4' />
          퇴원 회원 보기
        </a>
      </div>

      <div className='space-y-4'>
        {/* 탭 및 검색 */}
        <div className='flex flex-col gap-4 sm:flex-row'>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant={activeTab === 'students' ? 'default' : 'outline'}
              onClick={() => handleTabChange('students')}
            >
              <User className='mr-2 h-4 w-4' />
              학생 ({aggregates.studentTotal})
            </Button>
            <Button
              variant={activeTab === 'parents' ? 'default' : 'outline'}
              onClick={() => handleTabChange('parents')}
            >
              <UserCheck className='mr-2 h-4 w-4' />
              학부모 ({aggregates.parentTotal})
            </Button>
            <Button
              variant={activeTab === 'admins' ? 'default' : 'outline'}
              onClick={() => handleTabChange('admins')}
            >
              <Shield className='mr-2 h-4 w-4' />
              관리자 ({aggregates.adminTotal})
            </Button>
          </div>
          <SearchInput placeholder='이름 또는 이메일로 검색' className='flex-1' />
        </div>

        {/* 학생 탭: 승인 상태 · 학생 타입 필터 */}
        {activeTab === 'students' && (
          <div className='flex flex-col gap-3'>
            <div className='flex flex-wrap gap-2'>
              <button
                onClick={() => handleApprovalFilterChange('all')}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  studentFilter === 'all'
                    ? 'bg-primary text-white'
                    : 'text-text-muted bg-gray-100 hover:bg-gray-200',
                )}
              >
                전체 ({aggregates.approval.all})
              </button>
              <button
                onClick={() => handleApprovalFilterChange('pending')}
                className={cn(
                  'flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  studentFilter === 'pending'
                    ? 'bg-yellow-500 text-white'
                    : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
                )}
              >
                <Clock className='h-3.5 w-3.5' />
                승인 대기 ({pendingCount})
              </button>
              <button
                onClick={() => handleApprovalFilterChange('approved')}
                className={cn(
                  'flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  studentFilter === 'approved'
                    ? 'bg-green-600 text-white'
                    : 'bg-green-50 text-green-700 hover:bg-green-100',
                )}
              >
                <CheckCircle2 className='h-3.5 w-3.5' />
                승인됨 ({approvedCount})
              </button>
              {rejectedCount > 0 && (
                <button
                  onClick={() => handleApprovalFilterChange('rejected')}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    studentFilter === 'rejected'
                      ? 'bg-red-600 text-white'
                      : 'bg-red-50 text-red-700 hover:bg-red-100',
                  )}
                >
                  <X className='h-3.5 w-3.5' />
                  비승인 ({rejectedCount})
                </button>
              )}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-text-muted text-sm whitespace-nowrap'>학생 타입</span>
              <select
                value={
                  studentTypeFilter === 'all'
                    ? 'all'
                    : studentTypeFilter === 'unassigned'
                      ? 'unassigned'
                      : studentTypeFilter
                }
                onChange={(e) => {
                  const v = e.target.value;
                  const next: StudentTypeFilterValue =
                    v === 'all' ? 'all' : v === 'unassigned' ? 'unassigned' : v;
                  handleStudentTypeFilterChange(next);
                }}
                disabled={loading}
                className='focus:ring-primary/30 focus:border-primary h-8 min-w-[10rem] rounded-lg border border-gray-200 bg-white px-2 text-sm focus:ring-2 focus:outline-none'
                aria-label='학생 타입 필터'
              >
                <option value='all'>전체 ({aggregates.studentTypeAll})</option>
                <option value='unassigned'>미배정 ({unassignedStudentCount})</option>
                {allStudentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({aggregates.studentTypeCounts[t.id] ?? 0})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* 관리자 목록 테이블 */}
        {activeTab === 'admins' ? (
          <div className='space-y-4'>
            {/* 관리자 추가 버튼 (슈퍼관리자만) */}
            {currentIsSuperAdmin && (
              <div className='flex justify-end'>
                <Button onClick={() => setAddAdminOpen(true)} size='sm' className='gap-1.5'>
                  <Plus className='h-3.5 w-3.5' />
                  관리자 추가
                </Button>
              </div>
            )}

            <Card className='overflow-hidden'>
              <div className='overflow-x-auto'>
                <table className='w-full text-xs'>
                  <thead className='border-b border-gray-100 bg-gray-50'>
                    <tr>
                      <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                        이름
                      </th>
                      <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                        이메일
                      </th>
                      <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                        전화번호
                      </th>
                      <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                        소속 지점
                      </th>
                      <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                        가입일
                      </th>
                      <th className='px-2 py-2 text-center text-xs font-medium text-gray-600'>
                        액션
                      </th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-100'>
                    {admins.length === 0 ? (
                      <tr>
                        <td colSpan={6} className='px-2 py-6 text-center text-xs text-gray-500'>
                          관리자가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      admins.map((admin) => (
                        <tr key={admin.id} className='hover:bg-gray-50'>
                          <td className='px-2 py-1.5'>
                            <div className='flex items-center gap-1.5'>
                              <div className='flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-100'>
                                <Shield className='h-3 w-3 text-purple-600' />
                              </div>
                              <span className='font-medium'>{admin.name}</span>
                              {admin.is_super_admin && (
                                <span className='inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700'>
                                  최고
                                </span>
                              )}
                            </div>
                          </td>
                          <td className='px-2 py-1.5 text-gray-600'>{admin.email}</td>
                          <td className='px-2 py-1.5'>{admin.phone || '-'}</td>
                          <td className='px-2 py-1.5'>
                            {admin.is_super_admin ? (
                              <span className='inline-flex items-center gap-0.5 rounded border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700'>
                                전 지점
                              </span>
                            ) : (
                              <select
                                value={admin.branch_id || ''}
                                onChange={(e) => handleBranchChange(admin.id, e.target.value)}
                                disabled={loading || !currentIsSuperAdmin}
                                className={cn(
                                  'focus:ring-primary/50 rounded border px-2 py-1 text-xs focus:ring-1 focus:outline-none',
                                  !admin.branch_id
                                    ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                                    : 'border-gray-200 bg-white',
                                  !currentIsSuperAdmin && 'cursor-not-allowed opacity-70',
                                )}
                              >
                                <option value=''>지점 미지정</option>
                                {branches.map((branch) => (
                                  <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className='px-2 py-1.5 text-gray-500'>
                            {formatDate(admin.created_at)}
                          </td>
                          <td className='px-2 py-1.5 text-center'>
                            <div className='flex items-center justify-center gap-1'>
                              {currentIsSuperAdmin && (
                                <>
                                  <Button
                                    size='sm'
                                    variant='outline'
                                    onClick={() => setResetPasswordTarget(admin)}
                                    disabled={loading}
                                    className='h-6 border-amber-200 px-1.5 text-amber-600 hover:bg-amber-50'
                                    title='비밀번호 강제 재설정'
                                  >
                                    <Key className='h-3 w-3' />
                                  </Button>
                                  <Button
                                    size='sm'
                                    variant='outline'
                                    onClick={() => handleToggleSuperAdmin(admin)}
                                    disabled={loading}
                                    className={cn(
                                      'h-6 px-2 text-[11px] font-medium',
                                      admin.is_super_admin
                                        ? 'border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100'
                                        : 'border-purple-200 text-purple-600 hover:bg-purple-50',
                                    )}
                                    title={
                                      admin.is_super_admin
                                        ? '최고 관리자 권한 회수'
                                        : '최고 관리자 권한 부여'
                                    }
                                  >
                                    {admin.is_super_admin ? '권한 회수' : '권한 부여'}
                                  </Button>
                                  <Button
                                    size='sm'
                                    variant='outline'
                                    onClick={() => setDeleteAdminTarget(admin)}
                                    disabled={loading}
                                    className='h-6 border-red-200 px-1.5 text-red-500 hover:bg-red-50 hover:text-red-600'
                                    title='어드민 삭제'
                                  >
                                    <Trash2 className='h-3 w-3' />
                                  </Button>
                                </>
                              )}
                              {!currentIsSuperAdmin && (
                                <span className='text-[10px] text-gray-400'>최고 관리자 전용</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ) : activeTab === 'students' ? (
          /* 학생 목록 테이블 */
          <Card className='overflow-hidden'>
            <div className='overflow-x-auto'>
              <table className='w-full text-xs'>
                <thead className='border-b border-gray-100 bg-gray-50'>
                  <tr>
                    <th
                      className='cursor-pointer px-2 py-2 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100'
                      onClick={() => handleSort('seat_number')}
                    >
                      <div className='flex items-center gap-0.5'>
                        번호
                        {renderSortIcon('seat_number')}
                      </div>
                    </th>
                    <th
                      className='cursor-pointer px-2 py-2 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100'
                      onClick={() => handleSort('name')}
                    >
                      <div className='flex items-center gap-0.5'>
                        이름
                        {renderSortIcon('name')}
                      </div>
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                      이메일
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>학교</th>
                    <th
                      className='cursor-pointer px-2 py-2 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100'
                      onClick={() => handleSort('branch_name')}
                    >
                      <div className='flex items-center gap-0.5'>
                        센터
                        {renderSortIcon('branch_name')}
                      </div>
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>타입</th>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                      전화번호
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                      학부모
                    </th>
                    <th className='px-2 py-2 text-center text-xs font-medium text-gray-600'>
                      상태
                    </th>
                    <th className='px-2 py-2 text-center text-xs font-medium text-gray-600'>
                      액션
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-100'>
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={10} className='px-2 py-6 text-center text-xs text-gray-500'>
                        {studentFilter === 'pending'
                          ? '승인 대기중인 학생이 없습니다.'
                          : studentFilter === 'rejected'
                            ? '비승인된 학생이 없습니다.'
                            : studentTypeFilter === 'unassigned'
                              ? '미배정 학생이 없습니다.'
                              : studentTypeFilter !== 'all'
                                ? '해당 타입의 학생이 없습니다.'
                                : '학생이 없습니다.'}
                      </td>
                    </tr>
                  ) : (
                    students.map((member) => (
                      <tr
                        key={member.id}
                        className={cn(
                          'hover:bg-gray-50',
                          member.is_rejected && 'bg-red-50/50',
                          !member.is_approved && !member.is_rejected && 'bg-yellow-50/50',
                        )}
                      >
                        {/* 좌석번호 */}
                        <td className='px-2 py-1.5'>
                          <span
                            className={cn(
                              'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                              member.seat_number
                                ? 'bg-primary/10 text-primary'
                                : 'bg-gray-100 text-gray-400',
                            )}
                          >
                            {member.seat_number || '-'}
                          </span>
                        </td>
                        {/* 이름 (편집 가능) */}
                        <td className='px-2 py-1.5'>
                          {editingNameId === member.id ? (
                            <div className='flex items-center gap-1'>
                              <Input
                                type='text'
                                value={editingNameValue}
                                onChange={(e) => setEditingNameValue(e.target.value)}
                                className='h-6 w-20 px-1.5 text-xs'
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveNameEdit(member.id);
                                  if (e.key === 'Escape') setEditingNameId(null);
                                }}
                              />
                              <button
                                onClick={() => handleSaveNameEdit(member.id)}
                                className='text-green-600 hover:text-green-700'
                                disabled={loading}
                              >
                                <Check className='h-3.5 w-3.5' />
                              </button>
                              <button
                                onClick={() => setEditingNameId(null)}
                                className='text-red-500 hover:text-red-600'
                              >
                                <X className='h-3.5 w-3.5' />
                              </button>
                            </div>
                          ) : (
                            <div className='group flex items-center gap-1.5'>
                              <div
                                className={cn(
                                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full',
                                  member.is_approved
                                    ? 'bg-primary/10'
                                    : member.is_rejected
                                      ? 'bg-red-100'
                                      : 'bg-yellow-100',
                                )}
                              >
                                <User
                                  className={cn(
                                    'h-3 w-3',
                                    member.is_approved
                                      ? 'text-primary'
                                      : member.is_rejected
                                        ? 'text-red-600'
                                        : 'text-yellow-600',
                                  )}
                                />
                              </div>
                              <span className='font-medium'>{member.name}</span>
                              <button
                                onClick={() => handleStartEditName(member)}
                                className='hover:text-primary text-gray-400 opacity-0 transition-opacity group-hover:opacity-100'
                              >
                                <Edit3 className='h-3 w-3' />
                              </button>
                            </div>
                          )}
                        </td>
                        {/* 이메일 */}
                        <td
                          className='max-w-[160px] truncate px-2 py-1.5 text-gray-600'
                          title={member.email}
                        >
                          {member.email}
                        </td>
                        {/* 학교 */}
                        <td className='px-2 py-1.5'>
                          <input
                            type='text'
                            defaultValue={member.school || ''}
                            placeholder='-'
                            className='focus:border-primary focus:ring-primary/50 h-6 w-20 rounded border border-transparent bg-transparent px-1.5 text-xs hover:border-gray-200 focus:ring-1 focus:outline-none'
                            onBlur={(e) => {
                              if (e.target.value !== (member.school || '')) {
                                handleUpdateStudentField(member.id, 'school', e.target.value);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        </td>
                        {/* 센터 */}
                        <td className='px-2 py-1.5'>
                          <select
                            value={member.branch_id || ''}
                            onChange={(e) => handleUpdateStudentBranch(member.id, e.target.value)}
                            disabled={loading}
                            className={cn(
                              'focus:ring-primary/50 h-6 rounded border px-1.5 text-xs focus:ring-1 focus:outline-none',
                              member.branch_id
                                ? 'border-blue-200 bg-blue-50 font-medium text-blue-700 hover:border-blue-400'
                                : 'border-transparent bg-transparent text-gray-400 hover:border-gray-200',
                            )}
                          >
                            <option value=''>-</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* 학생 타입 */}
                        <td className='px-2 py-1.5'>
                          <select
                            value={member.student_type_id || ''}
                            onChange={(e) =>
                              handleUpdateStudentTypeInline(member.id, e.target.value)
                            }
                            disabled={loading}
                            className='focus:border-primary focus:ring-primary/50 h-6 rounded border border-transparent bg-transparent px-1.5 text-xs hover:border-gray-200 focus:ring-1 focus:outline-none'
                          >
                            <option value=''>-</option>
                            {allStudentTypes.map((type) => (
                              <option key={type.id} value={type.id}>
                                {type.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* 전화번호 */}
                        <td className='px-2 py-1.5'>{member.phone || '-'}</td>
                        {/* 학부모 */}
                        <td className='px-2 py-1.5'>
                          {(() => {
                            const linkedParents = studentParentMap[member.id];
                            if (!linkedParents || linkedParents.length === 0) {
                              return <span className='text-[10px] text-gray-400'>-</span>;
                            }
                            return (
                              <div className='flex flex-col gap-0.5'>
                                {linkedParents.map((p) => (
                                  <span
                                    key={p.id}
                                    className='bg-secondary/10 text-secondary inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium'
                                    title={p.phone || undefined}
                                  >
                                    <UserCheck className='h-2.5 w-2.5 flex-shrink-0' />
                                    {p.name}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                        {/* 상태 */}
                        <td className='px-2 py-1.5 text-center'>
                          <select
                            value={
                              member.is_approved
                                ? 'approved'
                                : member.is_rejected
                                  ? 'rejected'
                                  : 'pending'
                            }
                            onChange={(e) =>
                              handleUpdateApprovalStatus(
                                member.id,
                                e.target.value as 'approved' | 'pending' | 'rejected',
                              )
                            }
                            disabled={loading}
                            className={cn(
                              'focus:ring-primary/50 h-6 cursor-pointer rounded border px-1.5 text-[10px] font-medium focus:ring-1 focus:outline-none',
                              member.is_approved
                                ? 'border-green-200 bg-green-50 text-green-700 hover:border-green-400'
                                : member.is_rejected
                                  ? 'border-red-200 bg-red-50 text-red-700 hover:border-red-400'
                                  : 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:border-yellow-400',
                            )}
                          >
                            <option value='approved'>✓ 승인</option>
                            <option value='pending'>⏱ 대기</option>
                            <option value='rejected'>✕ 비승인</option>
                          </select>
                        </td>
                        {/* 액션 */}
                        <td className='px-2 py-1.5 text-center'>
                          <div className='flex items-center justify-center gap-0.5'>
                            {!member.is_approved && !member.is_rejected ? (
                              <>
                                <Button
                                  size='sm'
                                  onClick={() => handleOpenApproval(member)}
                                  disabled={loading}
                                  className='h-6 bg-green-600 px-2 text-xs text-white hover:bg-green-700'
                                >
                                  <UserPlus className='mr-0.5 h-3 w-3' />
                                  승인
                                </Button>
                                <Button
                                  size='sm'
                                  variant='outline'
                                  onClick={() => handleOpenDeleteModal(member, 'student')}
                                  disabled={loading}
                                  className='h-6 border-red-200 px-1.5 text-red-500 hover:bg-red-50 hover:text-red-600'
                                >
                                  <UserMinus className='h-3 w-3' />
                                </Button>
                              </>
                            ) : (
                              <>
                                {member.is_approved && (
                                  <Button
                                    size='sm'
                                    variant='outline'
                                    onClick={() => handleViewDetail(member.id)}
                                    disabled={loading}
                                    className='h-6 px-1.5'
                                  >
                                    <Eye className='h-3 w-3' />
                                  </Button>
                                )}
                                <Button
                                  size='sm'
                                  variant='outline'
                                  onClick={() => handleOpenDeleteModal(member, 'student')}
                                  disabled={loading}
                                  className='h-6 border-red-200 px-1.5 text-red-500 hover:bg-red-50 hover:text-red-600'
                                >
                                  <UserMinus className='h-3 w-3' />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          /* 학부모 목록 테이블 */
          <Card className='overflow-hidden'>
            <div className='overflow-x-auto'>
              <table className='w-full text-xs'>
                <thead className='border-b border-gray-100 bg-gray-50'>
                  <tr>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>이름</th>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                      연결된 학생
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>지점</th>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                      이메일
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                      전화번호
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-medium text-gray-600'>
                      가입일
                    </th>
                    <th className='px-2 py-2 text-center text-xs font-medium text-gray-600'>
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-100'>
                  {parents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className='px-2 py-6 text-center text-xs text-gray-500'>
                        학부모가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    parents.map((parent) => (
                      <tr key={parent.id} className='hover:bg-gray-50'>
                        <td className='px-2 py-1.5'>
                          <div className='flex items-center gap-1.5'>
                            <div className='bg-secondary/10 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full'>
                              <UserCheck className='text-secondary h-3 w-3' />
                            </div>
                            <span className='font-medium'>{parent.name}</span>
                          </div>
                        </td>
                        <td className='px-2 py-1.5'>
                          {!parent.students || parent.students.length === 0 ? (
                            <span className='text-gray-400'>미연결</span>
                          ) : (
                            <div className='flex flex-wrap gap-0.5'>
                              {parent.students.map((student) => (
                                <span
                                  key={student.id}
                                  className='bg-primary/10 text-primary inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px]'
                                >
                                  {student.seatNumber && (
                                    <span className='text-primary/70'>{student.seatNumber}번</span>
                                  )}
                                  {student.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className='px-2 py-1.5'>
                          {!parent.students || parent.students.length === 0 ? (
                            <span className='text-gray-400'>-</span>
                          ) : (
                            <div className='flex flex-wrap gap-0.5'>
                              {[
                                ...new Set(
                                  parent.students.map((s) => s.branchName).filter(Boolean),
                                ),
                              ].map((branchName) => (
                                <span
                                  key={branchName}
                                  className='inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700'
                                >
                                  <Building2 className='h-2.5 w-2.5 flex-shrink-0' />
                                  {branchName}
                                </span>
                              ))}
                              {parent.students.every((s) => !s.branchName) && (
                                <span className='text-gray-400'>-</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className='px-2 py-1.5 text-gray-600'>{parent.email}</td>
                        <td className='px-2 py-1.5'>{parent.phone || '-'}</td>
                        <td className='px-2 py-1.5 text-gray-500'>
                          {formatDate(parent.created_at)}
                        </td>
                        <td className='px-2 py-1.5 text-center'>
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => handleOpenDeleteModal(parent, 'parent')}
                            disabled={loading}
                            className='h-6 border-red-200 px-1.5 text-red-500 hover:bg-red-50 hover:text-red-600'
                          >
                            <UserMinus className='h-3 w-3' />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* 페이지네이션 — 활성 탭 서버 total 기준 */}
        {(() => {
          const activeTotal =
            activeTab === 'students'
              ? studentsTotal
              : activeTab === 'parents'
                ? parentsTotal
                : adminsTotal;
          if (activeTotal === 0) return null;
          return (
            <div className='mt-4 flex justify-center'>
              <Pagination
                total={activeTotal}
                page={Math.min(page, Math.max(1, Math.ceil(activeTotal / pageSize)))}
                pageSize={pageSize}
                pathname={pathname}
                searchParams={new URLSearchParams(sp.toString())}
              />
            </div>
          );
        })()}
      </div>

      {/* 학생 상세 정보 모달 */}
      {selectedStudent && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <Card className='max-h-[90vh] w-full max-w-lg overflow-y-auto p-6'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>학생 상세 정보</h2>
              <button
                onClick={() => setSelectedStudent(null)}
                className='text-text-muted hover:text-text'
              >
                <X className='h-5 w-5' />
              </button>
            </div>

            {/* 기본 정보 */}
            <div className='space-y-4'>
              <div className='flex items-center gap-4'>
                <div className='bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full'>
                  <User className='text-primary h-8 w-8' />
                </div>
                <div>
                  <h3 className='text-xl font-bold'>{selectedStudent.name}</h3>
                  <p className='text-text-muted'>좌석 {selectedStudent.seatNumber || '미배정'}번</p>
                </div>
              </div>

              <div className='space-y-2 border-t pt-4'>
                {/* 좌석 번호 */}
                <div className='flex items-center justify-between'>
                  <span className='text-text-muted text-sm'>좌석 번호</span>
                  {editMode?.id === selectedStudent.id && editMode.field === 'seatNumber' ? (
                    <div className='flex items-center gap-2'>
                      <Input
                        type='number'
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className='h-8 w-20 text-sm'
                      />
                      <button onClick={handleSaveEdit} className='text-success'>
                        <Check className='h-4 w-4' />
                      </button>
                      <button onClick={() => setEditMode(null)} className='text-error'>
                        <X className='h-4 w-4' />
                      </button>
                    </div>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <span className='font-medium'>{selectedStudent.seatNumber || '-'}</span>
                      <button
                        onClick={() =>
                          handleEdit(selectedStudent.id, 'seatNumber', selectedStudent.seatNumber)
                        }
                        className='text-text-muted hover:text-primary'
                      >
                        <Edit3 className='h-4 w-4' />
                      </button>
                    </div>
                  )}
                </div>

                {/* CAPS ID (출입관리 학번) */}
                <div className='flex items-center justify-between'>
                  <span className='text-text-muted text-sm'>CAPS ID</span>
                  {editMode?.id === selectedStudent.id && editMode.field === 'capsId' ? (
                    <div className='flex items-center gap-2'>
                      <Input
                        type='text'
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder='CAPS ID 입력'
                        className='h-8 w-24 text-sm'
                      />
                      <button onClick={handleSaveEdit} className='text-success'>
                        <Check className='h-4 w-4' />
                      </button>
                      <button onClick={() => setEditMode(null)} className='text-error'>
                        <X className='h-4 w-4' />
                      </button>
                    </div>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <code
                        className={cn(
                          'rounded px-2 py-0.5 text-sm',
                          selectedStudent.capsId
                            ? 'bg-primary/10 text-primary'
                            : 'text-text-muted bg-gray-100',
                        )}
                      >
                        {selectedStudent.capsId || '미설정'}
                      </code>
                      <button
                        onClick={() =>
                          handleEdit(selectedStudent.id, 'capsId', selectedStudent.capsId)
                        }
                        className='text-text-muted hover:text-primary'
                      >
                        <Edit3 className='h-4 w-4' />
                      </button>
                    </div>
                  )}
                </div>

                {/* 학생 타입 */}
                <div className='flex items-center justify-between'>
                  <span className='text-text-muted text-sm'>학생 타입</span>
                  {editMode?.id === selectedStudent.id && editMode.field === 'studentTypeId' ? (
                    <div className='flex items-center gap-2'>
                      <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className='focus:ring-primary/50 h-8 rounded-lg border px-2 text-sm focus:ring-2 focus:outline-none'
                      >
                        <option value=''>미지정</option>
                        {studentTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                      <button onClick={handleSaveEdit} className='text-success'>
                        <Check className='h-4 w-4' />
                      </button>
                      <button onClick={() => setEditMode(null)} className='text-error'>
                        <X className='h-4 w-4' />
                      </button>
                    </div>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-sm',
                          selectedStudent.studentType
                            ? 'bg-secondary/10 text-secondary font-medium'
                            : 'text-text-muted bg-gray-100',
                        )}
                      >
                        {selectedStudent.studentType?.name || '미지정'}
                      </span>
                      <button
                        onClick={() =>
                          handleEdit(
                            selectedStudent.id,
                            'studentTypeId',
                            selectedStudent.studentTypeId,
                          )
                        }
                        className='text-text-muted hover:text-primary'
                      >
                        <Edit3 className='h-4 w-4' />
                      </button>
                    </div>
                  )}
                </div>

                {/* 이메일 */}
                <div className='flex items-center justify-between'>
                  <span className='text-text-muted flex items-center gap-1 text-sm'>
                    <Mail className='h-4 w-4' /> 이메일
                  </span>
                  <span className='text-sm'>{selectedStudent.email}</span>
                </div>

                {/* 전화번호 */}
                <div className='flex items-center justify-between'>
                  <span className='text-text-muted flex items-center gap-1 text-sm'>
                    <Phone className='h-4 w-4' /> 전화번호
                  </span>
                  <span className='text-sm'>{selectedStudent.phone || '-'}</span>
                </div>

                {/* 가입일 */}
                <div className='flex items-center justify-between'>
                  <span className='text-text-muted flex items-center gap-1 text-sm'>
                    <Calendar className='h-4 w-4' /> 가입일
                  </span>
                  <span className='text-sm'>{formatDate(selectedStudent.createdAt)}</span>
                </div>

                {/* 학부모 연결 코드 */}
                <div className='flex items-center justify-between'>
                  <span className='text-text-muted text-sm'>연결 코드</span>
                  <code className='rounded bg-gray-100 px-2 py-1 text-sm'>
                    {selectedStudent.parentCode}
                  </code>
                </div>
              </div>

              {/* 연결된 학부모 */}
              <div className='border-t pt-4'>
                <h4 className='mb-2 flex items-center gap-1 text-sm font-medium'>
                  <UserCheck className='text-secondary h-4 w-4' />
                  연결된 학부모
                  {selectedStudent.parents && selectedStudent.parents.length > 1 && (
                    <span className='bg-secondary/10 text-secondary ml-1 rounded-full px-1.5 py-0.5 text-xs font-normal'>
                      {selectedStudent.parents.length}명
                    </span>
                  )}
                </h4>
                {!selectedStudent.parents || selectedStudent.parents.length === 0 ? (
                  <p className='rounded-xl bg-gray-50 p-3 text-sm text-gray-400'>미연결</p>
                ) : (
                  <div className='space-y-2'>
                    {selectedStudent.parents.map((p, idx) => (
                      <div key={p.id || idx} className='rounded-xl bg-gray-50 p-3'>
                        <div className='mb-1.5 flex items-center gap-2'>
                          <div className='bg-secondary/10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full'>
                            <UserCheck className='text-secondary h-3.5 w-3.5' />
                          </div>
                          <p className='text-sm font-medium'>{p.name}</p>
                        </div>
                        <div className='space-y-0.5 pl-8'>
                          <p className='text-text-muted flex items-center gap-1 text-xs'>
                            <Mail className='h-3 w-3' />
                            {p.email}
                          </p>
                          <p className='text-text-muted flex items-center gap-1 text-xs'>
                            <Phone className='h-3 w-3' />
                            {p.phone || '-'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 학습 통계 (최근 30일) */}
              <div className='border-t pt-4'>
                <h4 className='mb-3 text-sm font-medium'>최근 30일 통계</h4>
                <div className='grid grid-cols-2 gap-3'>
                  <div className='bg-primary/10 rounded-xl p-3 text-center'>
                    <BookOpen className='text-primary mx-auto mb-1 h-5 w-5' />
                    <p className='text-primary text-2xl font-bold'>
                      {selectedStudent.stats.attendanceDays}
                    </p>
                    <p className='text-text-muted text-xs'>출석일</p>
                  </div>
                  <div className='bg-secondary/10 rounded-xl p-3 text-center'>
                    <Brain className='text-secondary mx-auto mb-1 h-5 w-5' />
                    <p className='text-secondary text-2xl font-bold'>
                      {selectedStudent.stats.avgFocus ?? '-'}
                    </p>
                    <p className='text-text-muted text-xs'>평균 몰입도</p>
                  </div>
                  <div className='bg-success/20 rounded-xl p-3 text-center'>
                    <Award className='mx-auto mb-1 h-5 w-5 text-green-600' />
                    <p className='text-2xl font-bold text-green-600'>
                      +{selectedStudent.stats.totalReward}
                    </p>
                    <p className='text-text-muted text-xs'>상점</p>
                  </div>
                  <div className='bg-error/20 rounded-xl p-3 text-center'>
                    <Award className='mx-auto mb-1 h-5 w-5 text-red-500' />
                    <p className='text-2xl font-bold text-red-500'>
                      -{selectedStudent.stats.totalPenalty}
                    </p>
                    <p className='text-text-muted text-xs'>벌점</p>
                  </div>
                </div>
              </div>

              {/* 회원 퇴원 버튼 */}
              <div className='border-t pt-4'>
                <Button
                  variant='outline'
                  onClick={() => {
                    // Member 형태로 변환
                    const memberData: Member = {
                      id: selectedStudent.id,
                      email: selectedStudent.email,
                      name: selectedStudent.name,
                      phone: selectedStudent.phone,
                      user_type: 'student',
                      is_approved: true,
                      created_at: selectedStudent.createdAt,
                      branch_id: selectedStudent.branchId,
                      branch_name: null,
                      seat_number: selectedStudent.seatNumber ?? null,
                      school: null,
                      grade: null,
                      student_type_id: selectedStudent.studentTypeId ?? null,
                      parents: selectedStudent.parents.map((p) => ({
                        id: p.id,
                        name: p.name,
                        phone: p.phone,
                      })),
                    };
                    handleOpenDeleteModal(memberData, 'student');
                  }}
                  disabled={loading}
                  className='w-full border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600'
                >
                  <UserMinus className='mr-2 h-4 w-4' />
                  퇴원 처리
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {approvalTarget && (
        <ApprovalModal
          student={approvalTarget}
          onClose={() => setApprovalTarget(null)}
          onSuccess={() => {
            setApprovalTarget(null);
            refresh();
          }}
        />
      )}

      {deleteTarget && (
        <DeleteMemberModal
          member={deleteTarget.member}
          userType={deleteTarget.userType}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            setSelectedStudent(null);
            refresh();
          }}
        />
      )}

      {addAdminOpen && (
        <AddAdminModal
          branches={branches}
          onClose={() => setAddAdminOpen(false)}
          onSuccess={() => {
            setAddAdminOpen(false);
            refresh();
          }}
        />
      )}

      {deleteAdminTarget && (
        <DeleteAdminModal
          admin={deleteAdminTarget}
          onClose={() => setDeleteAdminTarget(null)}
          onSuccess={() => {
            setDeleteAdminTarget(null);
            refresh();
          }}
        />
      )}

      {resetPasswordTarget && (
        <ResetAdminPasswordModal
          admin={{
            id: resetPasswordTarget.id,
            name: resetPasswordTarget.name,
            email: resetPasswordTarget.email,
          }}
          onClose={() => setResetPasswordTarget(null)}
          onSuccess={() => {
            setResetPasswordTarget(null);
            alert('비밀번호가 재설정되었습니다. 해당 어드민에게 안전하게 전달해 주세요.');
          }}
        />
      )}
    </div>
  );
}
