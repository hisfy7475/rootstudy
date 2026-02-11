'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getStudentDetail, updateMember, updateStudentSeat, updateStudentCapsId, getAllMembers, getAllAdmins, updateAdminBranch, updateStudentType, approveStudent, deleteMember, createAdmin, deleteAdmin } from '@/lib/actions/admin';
import { getStudentTypes } from '@/lib/actions/student-type';
import {
  Users,
  User,
  UserCheck,
  Search,
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
  AlertTriangle,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  user_type: string;
  is_approved: boolean;
  created_at: string;
  branch_id: string | null;
  seat_number: number | null;
  school: string | null;
  grade: number | null;
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
  }[];
}

interface Admin {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  branch_id: string | null;
  branch_name: string | null;
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
  parent: {
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

interface MembersClientProps {
  initialStudents: Member[];
  initialParents: ParentMember[];
  initialAdmins: Admin[];
  branches: Branch[];
}

type Tab = 'students' | 'parents' | 'admins';

interface StudentTypeOption {
  id: string;
  name: string;
}

export function MembersClient({ initialStudents, initialParents, initialAdmins, branches }: MembersClientProps) {
  const [students, setStudents] = useState<Member[]>(initialStudents);
  const [parents, setParents] = useState<ParentMember[]>(initialParents);
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [activeTab, setActiveTab] = useState<Tab>('students');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);
  const [studentTypes, setStudentTypes] = useState<StudentTypeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [studentFilter, setStudentFilter] = useState<'all' | 'pending' | 'approved'>('all');
  // 정렬 상태
  const [sortField, setSortField] = useState<'seat_number' | 'name' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  // 인라인 이름 편집 상태
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  // 승인 모달 상태
  const [approvalModal, setApprovalModal] = useState<{ student: Member } | null>(null);
  const [approvalForm, setApprovalForm] = useState({ capsId: '', seatNumber: '', studentTypeId: '' });
  const [approvalStudentTypes, setApprovalStudentTypes] = useState<StudentTypeOption[]>([]);
  // 탈퇴 모달 상태
  const [deleteModal, setDeleteModal] = useState<{ member: Member | ParentMember; userType: 'student' | 'parent' } | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  // 관리자 추가 모달 상태
  const [addAdminModal, setAddAdminModal] = useState(false);
  const [addAdminForm, setAddAdminForm] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    branchId: '',
  });
  const [addAdminError, setAddAdminError] = useState<string | null>(null);
  // 관리자 삭제 모달 상태
  const [deleteAdminModal, setDeleteAdminModal] = useState<Admin | null>(null);
  const [deleteAdminConfirmName, setDeleteAdminConfirmName] = useState('');

  const pendingCount = students.filter(s => !s.is_approved).length;
  const approvedCount = students.filter(s => s.is_approved).length;

  // 정렬 토글 핸들러
  const handleSort = (field: 'seat_number' | 'name') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // 정렬 아이콘 렌더링
  const renderSortIcon = (field: 'seat_number' | 'name') => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-primary" />
      : <ArrowDown className="w-3.5 h-3.5 text-primary" />;
  };

  const filteredStudents = students
    .filter((m) => {
      const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = studentFilter === 'all' ||
        (studentFilter === 'pending' && !m.is_approved) ||
        (studentFilter === 'approved' && m.is_approved);
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (!sortField) return 0;
      
      if (sortField === 'seat_number') {
        const aVal = a.seat_number ?? Infinity;
        const bVal = b.seat_number ?? Infinity;
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      if (sortField === 'name') {
        return sortDirection === 'asc' 
          ? a.name.localeCompare(b.name, 'ko')
          : b.name.localeCompare(a.name, 'ko');
      }
      
      return 0;
    });

  const filteredParents = parents.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.students.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredAdmins = admins.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 관리자 지점 변경
  const handleBranchChange = async (adminId: string, branchId: string) => {
    setLoading(true);
    try {
      const result = await updateAdminBranch(adminId, branchId || null);
      if (result.success) {
        // 관리자 목록 새로고침
        const updatedAdmins = await getAllAdmins();
        setAdmins(updatedAdmins);
      }
    } catch (error) {
      console.error('Failed to update branch:', error);
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
      setStudentTypes(types.map(t => ({ id: t.id, name: t.name })));
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

      // 데이터 새로고침
      const allMembers = await getAllMembers();
      setStudents(allMembers.filter(m => m.user_type === 'student'));
      setParents(allMembers.filter(m => m.user_type === 'parent'));

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
  const handleOpenApproval = async (student: Member) => {
    setApprovalModal({ student });
    setApprovalForm({ capsId: '', seatNumber: '', studentTypeId: '' });
    setLoading(true);
    try {
      // 학생 상세 정보 + 학생 타입 목록을 병렬 로드
      const [detail, types] = await Promise.all([
        getStudentDetail(student.id),
        getStudentTypes(),
      ]);
      setApprovalStudentTypes(types.map(t => ({ id: t.id, name: t.name })));
      // 학생이 가입 시 선택한 학생타입을 미리 채움
      if (detail) {
        setApprovalForm(prev => ({
          ...prev,
          studentTypeId: detail.studentTypeId || '',
          seatNumber: detail.seatNumber ? String(detail.seatNumber) : '',
          capsId: detail.capsId || '',
        }));
      }
    } catch (error) {
      console.error('Failed to load approval data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 승인 처리
  const handleApprove = async () => {
    if (!approvalModal) return;

    setLoading(true);
    try {
      const result = await approveStudent(
        approvalModal.student.id,
        approvalForm.capsId,
        approvalForm.seatNumber ? parseInt(approvalForm.seatNumber) : null,
        approvalForm.studentTypeId || null
      );

      if (result.success) {
        // 학생 목록 새로고침
        const allMembers = await getAllMembers();
        setStudents(allMembers.filter(m => m.user_type === 'student'));
        setApprovalModal(null);
      } else {
        alert(result.error || '승인에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to approve student:', error);
      alert('승인 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 탈퇴 모달 열기
  const handleOpenDeleteModal = (member: Member | ParentMember, userType: 'student' | 'parent') => {
    setDeleteModal({ member, userType });
    setDeleteConfirmName('');
  };

  // 탈퇴 처리
  const handleDelete = async () => {
    if (!deleteModal) return;
    if (deleteConfirmName !== deleteModal.member.name) {
      alert('회원 이름이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const result = await deleteMember(deleteModal.member.id, deleteModal.userType);

      if (result.success) {
        // 목록 새로고침
        const allMembers = await getAllMembers();
        setStudents(allMembers.filter(m => m.user_type === 'student'));
        setParents(allMembers.filter(m => m.user_type === 'parent') as unknown as ParentMember[]);
        setDeleteModal(null);
        setSelectedStudent(null); // 상세 모달도 닫기
        if (result.warning) {
          alert(result.warning);
        }
      } else {
        alert(result.error || '탈퇴 처리에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete member:', error);
      alert('탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
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
      
      // 학생 목록 새로고침
      const allMembers = await getAllMembers();
      setStudents(allMembers.filter(m => m.user_type === 'student'));
    } catch (error) {
      console.error('Failed to update name:', error);
    } finally {
      setLoading(false);
      setEditingNameId(null);
      setEditingNameValue('');
    }
  };

  // 학교/학년 수정 핸들러
  const handleUpdateStudentField = async (memberId: string, field: 'school' | 'grade', value: string) => {
    setLoading(true);
    try {
      const updateData: { school?: string | null; grade?: number | null } = {};
      if (field === 'school') {
        updateData.school = value || null;
      } else if (field === 'grade') {
        updateData.grade = value ? parseInt(value) : null;
      }
      
      await updateMember(memberId, updateData);
      
      // 학생 목록 새로고침
      const allMembers = await getAllMembers();
      setStudents(allMembers.filter(m => m.user_type === 'student'));
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
    } finally {
      setLoading(false);
    }
  };

  // 관리자 추가 처리
  const handleAddAdmin = async () => {
    if (!addAdminForm.email || !addAdminForm.password || !addAdminForm.name) {
      setAddAdminError('이메일, 비밀번호, 이름은 필수입니다.');
      return;
    }

    if (addAdminForm.password.length < 6) {
      setAddAdminError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);
    setAddAdminError(null);
    try {
      const result = await createAdmin({
        email: addAdminForm.email,
        password: addAdminForm.password,
        name: addAdminForm.name,
        phone: addAdminForm.phone || undefined,
        branchId: addAdminForm.branchId || undefined,
      });

      if (result.success) {
        // 관리자 목록 새로고침
        const updatedAdmins = await getAllAdmins();
        setAdmins(updatedAdmins);
        setAddAdminModal(false);
        setAddAdminForm({ email: '', password: '', name: '', phone: '', branchId: '' });
      } else {
        setAddAdminError(result.error || '관리자 추가에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to create admin:', error);
      setAddAdminError('관리자 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 관리자 삭제 처리
  const handleDeleteAdmin = async () => {
    if (!deleteAdminModal) return;
    if (deleteAdminConfirmName !== deleteAdminModal.name) {
      alert('관리자 이름이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const result = await deleteAdmin(deleteAdminModal.id);

      if (result.success) {
        // 관리자 목록 새로고침
        const updatedAdmins = await getAllAdmins();
        setAdmins(updatedAdmins);
        setDeleteAdminModal(null);
        setDeleteAdminConfirmName('');
        if (result.warning) {
          alert(result.warning);
        }
      } else {
        alert(result.error || '관리자 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete admin:', error);
      alert('관리자 삭제 중 오류가 발생했습니다.');
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
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">회원 관리</h1>
        <p className="text-text-muted mt-1">학생, 학부모, 관리자 회원을 관리하세요</p>
      </div>

      <div className="space-y-4">
          {/* 탭 및 검색 */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={activeTab === 'students' ? 'default' : 'outline'}
                onClick={() => { setActiveTab('students'); setSelectedStudent(null); }}
              >
                <User className="w-4 h-4 mr-2" />
                학생 ({students.length})
              </Button>
              <Button
                variant={activeTab === 'parents' ? 'default' : 'outline'}
                onClick={() => { setActiveTab('parents'); setSelectedStudent(null); }}
              >
                <UserCheck className="w-4 h-4 mr-2" />
                학부모 ({parents.length})
              </Button>
              <Button
                variant={activeTab === 'admins' ? 'default' : 'outline'}
                onClick={() => { setActiveTab('admins'); setSelectedStudent(null); }}
              >
                <Shield className="w-4 h-4 mr-2" />
                관리자 ({admins.length})
              </Button>
            </div>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input
                placeholder="이름 또는 이메일로 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* 학생 탭: 승인 상태 필터 */}
          {activeTab === 'students' && (
            <div className="flex gap-2">
              <button
                onClick={() => setStudentFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  studentFilter === 'all'
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-text-muted hover:bg-gray-200"
                )}
              >
                전체 ({students.length})
              </button>
              <button
                onClick={() => setStudentFilter('pending')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1",
                  studentFilter === 'pending'
                    ? "bg-yellow-500 text-white"
                    : "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                승인 대기 ({pendingCount})
              </button>
              <button
                onClick={() => setStudentFilter('approved')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1",
                  studentFilter === 'approved'
                    ? "bg-green-600 text-white"
                    : "bg-green-50 text-green-700 hover:bg-green-100"
                )}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                승인됨 ({approvedCount})
              </button>
            </div>
          )}

          {/* 관리자 목록 테이블 */}
          {activeTab === 'admins' ? (
            <div className="space-y-4">
              {/* 관리자 추가 버튼 */}
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setAddAdminModal(true);
                    setAddAdminForm({ email: '', password: '', name: '', phone: '', branchId: '' });
                    setAddAdminError(null);
                  }}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  관리자 추가
                </Button>
              </div>

              <Card className="overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이름</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이메일</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">전화번호</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">소속 지점</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">가입일</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-text-muted">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredAdmins.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                          관리자가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredAdmins.map((admin) => (
                        <tr key={admin.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                                <Shield className="w-4 h-4 text-purple-600" />
                              </div>
                              <span className="font-medium">{admin.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-text-muted">{admin.email}</td>
                          <td className="px-4 py-3 text-sm">{admin.phone || '-'}</td>
                          <td className="px-4 py-3">
                            <select
                              value={admin.branch_id || ''}
                              onChange={(e) => handleBranchChange(admin.id, e.target.value)}
                              disabled={loading}
                              className={cn(
                                "px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50",
                                !admin.branch_id 
                                  ? "border-yellow-300 bg-yellow-50 text-yellow-700" 
                                  : "border-gray-200 bg-white"
                              )}
                            >
                              <option value="">지점 미지정</option>
                              {branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                  {branch.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm text-text-muted">
                            {formatDate(admin.created_at)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDeleteAdminModal(admin);
                                setDeleteAdminConfirmName('');
                              }}
                              disabled={loading}
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </Card>
            </div>
          ) : activeTab === 'students' ? (
            /* 학생 목록 테이블 */
            <Card className="overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-text-muted cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('seat_number')}
                    >
                      <div className="flex items-center gap-1">
                        좌석번호
                        {renderSortIcon('seat_number')}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-text-muted cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        이름
                        {renderSortIcon('name')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">학교</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">학년</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">전화번호</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">상태</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-text-muted">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                        {studentFilter === 'pending' ? '승인 대기중인 학생이 없습니다.' : '학생이 없습니다.'}
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((member) => (
                      <tr key={member.id} className={cn("hover:bg-gray-50", !member.is_approved && "bg-yellow-50/50")}>
                        {/* 좌석번호 */}
                        <td className="px-4 py-3 text-sm">
                          <span className={cn(
                            "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium",
                            member.seat_number ? "bg-primary/10 text-primary" : "bg-gray-100 text-text-muted"
                          )}>
                            {member.seat_number || '-'}
                          </span>
                        </td>
                        {/* 이름 (편집 가능) */}
                        <td className="px-4 py-3">
                          {editingNameId === member.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="text"
                                value={editingNameValue}
                                onChange={(e) => setEditingNameValue(e.target.value)}
                                className="w-24 h-8 text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveNameEdit(member.id);
                                  if (e.key === 'Escape') setEditingNameId(null);
                                }}
                              />
                              <button 
                                onClick={() => handleSaveNameEdit(member.id)} 
                                className="text-success hover:text-green-700"
                                disabled={loading}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setEditingNameId(null)} 
                                className="text-error hover:text-red-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group">
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                                member.is_approved ? "bg-primary/10" : "bg-yellow-100"
                              )}>
                                <User className={cn("w-4 h-4", member.is_approved ? "text-primary" : "text-yellow-600")} />
                              </div>
                              <span className="font-medium">{member.name}</span>
                              <button
                                onClick={() => handleStartEditName(member)}
                                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-primary transition-opacity"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                        {/* 학교 */}
                        <td className="px-4 py-3 text-sm">
                          <input
                            type="text"
                            defaultValue={member.school || ''}
                            placeholder="학교 입력"
                            className="w-28 h-8 px-2 text-sm border border-transparent rounded-lg hover:border-gray-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 bg-transparent"
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
                        {/* 학년 */}
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={member.grade || ''}
                            onChange={(e) => handleUpdateStudentField(member.id, 'grade', e.target.value)}
                            className="h-8 px-2 text-sm border border-transparent rounded-lg hover:border-gray-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 bg-transparent"
                          >
                            <option value="">선택</option>
                            <option value="1">1학년</option>
                            <option value="2">2학년</option>
                            <option value="3">3학년</option>
                          </select>
                        </td>
                        {/* 전화번호 */}
                        <td className="px-4 py-3 text-sm">{member.phone || '-'}</td>
                        {/* 상태 */}
                        <td className="px-4 py-3 text-sm">
                          {member.is_approved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              승인됨
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                              <Clock className="w-3 h-3" />
                              대기중
                            </span>
                          )}
                        </td>
                        {/* 액션 */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {!member.is_approved ? (
                              <Button
                                size="sm"
                                onClick={() => handleOpenApproval(member)}
                                disabled={loading}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                <UserPlus className="w-4 h-4 mr-1" />
                                승인
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewDetail(member.id)}
                                disabled={loading}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenDeleteModal(member, 'student')}
                              disabled={loading}
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                            >
                              <UserMinus className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          ) : (
            /* 학부모 목록 테이블 */
            <Card className="overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이름</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">연결된 학생</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이메일</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">전화번호</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">가입일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredParents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                        학부모가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredParents.map((parent) => (
                      <tr key={parent.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                              <UserCheck className="w-4 h-4 text-secondary" />
                            </div>
                            <span className="font-medium">{parent.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {parent.students.length === 0 ? (
                            <span className="text-sm text-text-muted">미연결</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {parent.students.map((student) => (
                                <span
                                  key={student.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-sm rounded-full"
                                >
                                  <User className="w-3 h-3" />
                                  {student.seatNumber && (
                                    <span className="text-xs text-primary/70">{student.seatNumber}번</span>
                                  )}
                                  {student.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-muted">{parent.email}</td>
                        <td className="px-4 py-3 text-sm">{parent.phone || '-'}</td>
                        <td className="px-4 py-3 text-sm text-text-muted">
                          {formatDate(parent.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          )}
      </div>

      {/* 학생 상세 정보 모달 */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">학생 상세 정보</h2>
              <button
                onClick={() => setSelectedStudent(null)}
                className="text-text-muted hover:text-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 기본 정보 */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{selectedStudent.name}</h3>
                  <p className="text-text-muted">
                    좌석 {selectedStudent.seatNumber || '미배정'}번
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                {/* 좌석 번호 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">좌석 번호</span>
                  {editMode?.id === selectedStudent.id && editMode.field === 'seatNumber' ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-20 h-8 text-sm"
                      />
                      <button onClick={handleSaveEdit} className="text-success">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditMode(null)} className="text-error">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{selectedStudent.seatNumber || '-'}</span>
                      <button
                        onClick={() => handleEdit(selectedStudent.id, 'seatNumber', selectedStudent.seatNumber)}
                        className="text-text-muted hover:text-primary"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* CAPS ID (출입관리 학번) */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">CAPS ID</span>
                  {editMode?.id === selectedStudent.id && editMode.field === 'capsId' ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder="CAPS ID 입력"
                        className="w-24 h-8 text-sm"
                      />
                      <button onClick={handleSaveEdit} className="text-success">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditMode(null)} className="text-error">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <code className={cn(
                        "text-sm px-2 py-0.5 rounded",
                        selectedStudent.capsId ? "bg-primary/10 text-primary" : "bg-gray-100 text-text-muted"
                      )}>
                        {selectedStudent.capsId || '미설정'}
                      </code>
                      <button
                        onClick={() => handleEdit(selectedStudent.id, 'capsId', selectedStudent.capsId)}
                        className="text-text-muted hover:text-primary"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* 학생 타입 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">학생 타입</span>
                  {editMode?.id === selectedStudent.id && editMode.field === 'studentTypeId' ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 px-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="">미지정</option>
                        {studentTypes.map(type => (
                          <option key={type.id} value={type.id}>{type.name}</option>
                        ))}
                      </select>
                      <button onClick={handleSaveEdit} className="text-success">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditMode(null)} className="text-error">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-sm px-2 py-0.5 rounded",
                        selectedStudent.studentType ? "bg-secondary/10 text-secondary font-medium" : "bg-gray-100 text-text-muted"
                      )}>
                        {selectedStudent.studentType?.name || '미지정'}
                      </span>
                      <button
                        onClick={() => handleEdit(selectedStudent.id, 'studentTypeId', selectedStudent.studentTypeId)}
                        className="text-text-muted hover:text-primary"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* 이메일 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted flex items-center gap-1">
                    <Mail className="w-4 h-4" /> 이메일
                  </span>
                  <span className="text-sm">{selectedStudent.email}</span>
                </div>

                {/* 전화번호 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted flex items-center gap-1">
                    <Phone className="w-4 h-4" /> 전화번호
                  </span>
                  <span className="text-sm">{selectedStudent.phone || '-'}</span>
                </div>

                {/* 가입일 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted flex items-center gap-1">
                    <Calendar className="w-4 h-4" /> 가입일
                  </span>
                  <span className="text-sm">{formatDate(selectedStudent.createdAt)}</span>
                </div>

                {/* 학부모 연결 코드 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">연결 코드</span>
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                    {selectedStudent.parentCode}
                  </code>
                </div>
              </div>

              {/* 연결된 학부모 */}
              {selectedStudent.parent && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                    <UserCheck className="w-4 h-4 text-secondary" />
                    연결된 학부모
                  </h4>
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                    <p className="font-medium">{selectedStudent.parent.name}</p>
                    <p className="text-sm text-text-muted">{selectedStudent.parent.email}</p>
                    <p className="text-sm text-text-muted">{selectedStudent.parent.phone || '-'}</p>
                  </div>
                </div>
              )}

              {/* 학습 통계 (최근 30일) */}
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3">최근 30일 통계</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-primary/10 rounded-xl p-3 text-center">
                    <BookOpen className="w-5 h-5 text-primary mx-auto mb-1" />
                    <p className="text-2xl font-bold text-primary">
                      {selectedStudent.stats.attendanceDays}
                    </p>
                    <p className="text-xs text-text-muted">출석일</p>
                  </div>
                  <div className="bg-secondary/10 rounded-xl p-3 text-center">
                    <Brain className="w-5 h-5 text-secondary mx-auto mb-1" />
                    <p className="text-2xl font-bold text-secondary">
                      {selectedStudent.stats.avgFocus ?? '-'}
                    </p>
                    <p className="text-xs text-text-muted">평균 몰입도</p>
                  </div>
                  <div className="bg-success/20 rounded-xl p-3 text-center">
                    <Award className="w-5 h-5 text-green-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-green-600">
                      +{selectedStudent.stats.totalReward}
                    </p>
                    <p className="text-xs text-text-muted">상점</p>
                  </div>
                  <div className="bg-error/20 rounded-xl p-3 text-center">
                    <Award className="w-5 h-5 text-red-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-red-500">
                      -{selectedStudent.stats.totalPenalty}
                    </p>
                    <p className="text-xs text-text-muted">벌점</p>
                  </div>
                </div>
              </div>

              {/* 회원 탈퇴 버튼 */}
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
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
                      seat_number: selectedStudent.seatNumber ?? null,
                      school: null,
                      grade: null,
                    };
                    handleOpenDeleteModal(memberData, 'student');
                  }}
                  disabled={loading}
                  className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                >
                  <UserMinus className="w-4 h-4 mr-2" />
                  회원 탈퇴
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 승인 모달 */}
      {approvalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">학생 가입 승인</h2>
              <button
                onClick={() => setApprovalModal(null)}
                className="text-text-muted hover:text-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 학생 정보 */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="font-medium">{approvalModal.student.name}</p>
                  <p className="text-sm text-text-muted">{approvalModal.student.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm pl-[52px]">
                <Phone className="w-3.5 h-3.5 text-text-muted" />
                <span>{approvalModal.student.phone || '-'}</span>
              </div>
            </div>

            {/* 입력 폼 */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  CAPS ID <span className="text-text-muted font-normal">(출입관리 학번)</span>
                </label>
                <Input
                  type="text"
                  placeholder="CAPS ID 입력"
                  value={approvalForm.capsId}
                  onChange={(e) => setApprovalForm(prev => ({ ...prev, capsId: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">좌석 번호</label>
                <Input
                  type="number"
                  placeholder="좌석 번호 입력"
                  value={approvalForm.seatNumber}
                  onChange={(e) => setApprovalForm(prev => ({ ...prev, seatNumber: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">학생 타입</label>
                <select
                  value={approvalForm.studentTypeId}
                  onChange={(e) => setApprovalForm(prev => ({ ...prev, studentTypeId: e.target.value }))}
                  className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">학생 타입 선택</option>
                  {approvalStudentTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setApprovalModal(null)}
                disabled={loading}
              >
                취소
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={handleApprove}
                disabled={loading}
              >
                {loading ? '처리중...' : '승인'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 탈퇴 확인 모달 */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                회원 탈퇴
              </h2>
              <button
                onClick={() => setDeleteModal(null)}
                className="text-text-muted hover:text-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 경고 메시지 */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
              <p className="text-red-700 font-medium">이 작업은 되돌릴 수 없습니다.</p>
              <p className="text-sm text-red-600">
                <strong>[{deleteModal.member.name}]</strong> 회원을 탈퇴시키시겠습니까?
              </p>
              <p className="text-sm text-red-600">
                {deleteModal.userType === 'student' 
                  ? '모든 학습 기록, 출석 기록, 상벌점 등이 영구적으로 삭제됩니다.'
                  : '학부모 계정이 삭제됩니다. 연결된 학생 계정은 유지됩니다.'}
              </p>
            </div>

            {/* 회원 정보 */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  deleteModal.userType === 'student' ? "bg-primary/10" : "bg-secondary/10"
                )}>
                  {deleteModal.userType === 'student' 
                    ? <User className="w-5 h-5 text-primary" />
                    : <UserCheck className="w-5 h-5 text-secondary" />
                  }
                </div>
                <div>
                  <p className="font-medium">{deleteModal.member.name}</p>
                  <p className="text-sm text-text-muted">{deleteModal.member.email}</p>
                </div>
              </div>
            </div>

            {/* 확인 입력 */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                확인을 위해 회원 이름을 입력하세요
              </label>
              <Input
                type="text"
                placeholder={deleteModal.member.name}
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                className="border-red-200 focus:ring-red-500"
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteModal(null)}
                disabled={loading}
              >
                취소
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleDelete}
                disabled={loading || deleteConfirmName !== deleteModal.member.name}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {loading ? '처리중...' : '탈퇴 처리'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 관리자 추가 모달 */}
      {addAdminModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-600" />
                관리자 추가
              </h2>
              <button
                onClick={() => setAddAdminModal(false)}
                className="text-text-muted hover:text-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 입력 폼 */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  이메일 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <Input
                    type="email"
                    placeholder="admin@example.com"
                    value={addAdminForm.email}
                    onChange={(e) => setAddAdminForm(prev => ({ ...prev, email: e.target.value }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  비밀번호 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <Input
                    type="password"
                    placeholder="최소 6자 이상"
                    value={addAdminForm.password}
                    onChange={(e) => setAddAdminForm(prev => ({ ...prev, password: e.target.value }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  이름 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <Input
                    type="text"
                    placeholder="관리자 이름"
                    value={addAdminForm.name}
                    onChange={(e) => setAddAdminForm(prev => ({ ...prev, name: e.target.value }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">전화번호</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <Input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={addAdminForm.phone}
                    onChange={(e) => setAddAdminForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">소속 지점</label>
                <select
                  value={addAdminForm.branchId}
                  onChange={(e) => setAddAdminForm(prev => ({ ...prev, branchId: e.target.value }))}
                  className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">지점 선택 (선택사항)</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 에러 메시지 */}
            {addAdminError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {addAdminError}
              </div>
            )}

            {/* 버튼 */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAddAdminModal(false)}
                disabled={loading}
              >
                취소
              </Button>
              <Button
                className="flex-1"
                onClick={handleAddAdmin}
                disabled={loading}
              >
                <UserPlus className="w-4 h-4 mr-1" />
                {loading ? '추가중...' : '관리자 추가'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 관리자 삭제 모달 */}
      {deleteAdminModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                관리자 삭제
              </h2>
              <button
                onClick={() => setDeleteAdminModal(null)}
                className="text-text-muted hover:text-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 경고 메시지 */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
              <p className="text-red-700 font-medium">이 작업은 되돌릴 수 없습니다.</p>
              <p className="text-sm text-red-600">
                <strong>[{deleteAdminModal.name}]</strong> 관리자를 삭제하시겠습니까?
              </p>
            </div>

            {/* 관리자 정보 */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium">{deleteAdminModal.name}</p>
                  <p className="text-sm text-text-muted">{deleteAdminModal.email}</p>
                </div>
              </div>
              {deleteAdminModal.branch_name && (
                <div className="flex items-center gap-2 text-sm pl-[52px]">
                  <Building2 className="w-3.5 h-3.5 text-text-muted" />
                  <span>{deleteAdminModal.branch_name}</span>
                </div>
              )}
            </div>

            {/* 확인 입력 */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                확인을 위해 관리자 이름을 입력하세요
              </label>
              <Input
                type="text"
                placeholder={deleteAdminModal.name}
                value={deleteAdminConfirmName}
                onChange={(e) => setDeleteAdminConfirmName(e.target.value)}
                className="border-red-200 focus:ring-red-500"
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteAdminModal(null)}
                disabled={loading}
              >
                취소
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleDeleteAdmin}
                disabled={loading || deleteAdminConfirmName !== deleteAdminModal.name}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {loading ? '처리중...' : '삭제'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
