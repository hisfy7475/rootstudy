'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getStudentDetail, updateMember, updateStudentSeat, updateStudentCapsId, getAllMembers, getAllAdmins, updateAdminBranch, updateStudentType } from '@/lib/actions/admin';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  user_type: string;
  created_at: string;
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
  initialParents: Member[];
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
  const [parents, setParents] = useState<Member[]>(initialParents);
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [activeTab, setActiveTab] = useState<Tab>('students');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);
  const [studentTypes, setStudentTypes] = useState<StudentTypeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const filteredMembers = (activeTab === 'students' ? students : activeTab === 'parents' ? parents : []).filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase())
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
      
      // 학생의 지점에 해당하는 학생 타입 목록 로드
      if (detail?.branchId) {
        const types = await getStudentTypes(detail.branchId);
        setStudentTypes(types.map(t => ({ id: t.id, name: t.name })));
      }
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 회원 목록 */}
        <div className={cn("space-y-4", activeTab === 'admins' ? 'lg:col-span-3' : 'lg:col-span-2')}>
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

          {/* 관리자 목록 테이블 */}
          {activeTab === 'admins' ? (
            <Card className="overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이름</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이메일</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">전화번호</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">소속 지점</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">가입일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAdmins.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          ) : (
            /* 학생/학부모 목록 테이블 */
            <Card className="overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이름</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이메일</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">전화번호</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">가입일</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-text-muted">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                        회원이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              {activeTab === 'students' ? (
                                <User className="w-4 h-4 text-primary" />
                              ) : (
                                <UserCheck className="w-4 h-4 text-secondary" />
                              )}
                            </div>
                            <span className="font-medium">{member.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-muted">{member.email}</td>
                        <td className="px-4 py-3 text-sm">{member.phone || '-'}</td>
                        <td className="px-4 py-3 text-sm text-text-muted">
                          {formatDate(member.created_at)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {activeTab === 'students' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewDetail(member.id)}
                              disabled={loading}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* 오른쪽: 학생 상세 정보 (관리자 탭이 아닐 때만 표시) */}
        {activeTab !== 'admins' && (
        <div>
          {selectedStudent ? (
            <Card className="p-6 sticky top-6">
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

                  {/* 학년(학생 타입) */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">학년</span>
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
              </div>
            </Card>
          ) : (
            <Card className="p-6 text-center text-text-muted">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>학생을 선택하면 상세 정보를 확인할 수 있습니다.</p>
            </Card>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
