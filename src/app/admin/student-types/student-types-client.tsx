'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  GraduationCap, 
  Plus, 
  Pencil, 
  Trash2, 
  Users,
  Clock,
  BookOpen,
  X,
  Check
} from 'lucide-react';
import { 
  createStudentType, 
  updateStudentType, 
  deleteStudentType,
  getStudentTypeSubjects,
  setStudentTypeSubjects 
} from '@/lib/actions/student-type';
import type { StudentType, Branch } from '@/types/database';
import { DEFAULT_SUBJECTS } from '@/lib/constants';

interface StudentTypeWithCount extends StudentType {
  studentCount: number;
}

interface StudentTypesClientProps {
  initialTypes: StudentTypeWithCount[];
  branches: Branch[];
  unassignedCount: number;
}

export default function StudentTypesClient({ 
  initialTypes, 
  branches,
  unassignedCount 
}: StudentTypesClientProps) {
  const [types, setTypes] = useState(initialTypes);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [subjectEditingId, setSubjectEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 새 타입 추가 폼
  const [newName, setNewName] = useState('');
  const [newGoalHours, setNewGoalHours] = useState('40');
  const [newBranchId, setNewBranchId] = useState<string>('');

  // 수정 폼
  const [editName, setEditName] = useState('');
  const [editGoalHours, setEditGoalHours] = useState('');
  const [editBranchId, setEditBranchId] = useState<string>('');

  // 과목 설정
  const [typeSubjects, setTypeSubjects] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;

    setIsLoading(true);
    const result = await createStudentType({
      name: newName.trim(),
      weekly_goal_hours: parseInt(newGoalHours) || 40,
      branch_id: newBranchId || null,
    });

    if (result.success && result.data) {
      setTypes([...types, { ...result.data, studentCount: 0 }]);
      setNewName('');
      setNewGoalHours('40');
      setNewBranchId('');
      setShowAddForm(false);
    }
    setIsLoading(false);
  };

  const handleEdit = (type: StudentTypeWithCount) => {
    setEditingId(type.id);
    setEditName(type.name);
    setEditGoalHours(type.weekly_goal_hours.toString());
    setEditBranchId(type.branch_id || '');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;

    setIsLoading(true);
    const result = await updateStudentType(id, {
      name: editName.trim(),
      weekly_goal_hours: parseInt(editGoalHours) || 40,
      branch_id: editBranchId || null,
    });

    if (result.success) {
      setTypes(types.map(t =>
        t.id === id 
          ? { 
              ...t, 
              name: editName.trim(), 
              weekly_goal_hours: parseInt(editGoalHours) || 40,
              branch_id: editBranchId || null
            } 
          : t
      ));
      setEditingId(null);
    }
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 학생 타입을 삭제하시겠습니까? 해당 타입에 속한 학생들의 타입이 초기화됩니다.')) {
      return;
    }

    setIsLoading(true);
    const result = await deleteStudentType(id);

    if (result.success) {
      setTypes(types.filter(t => t.id !== id));
    }
    setIsLoading(false);
  };

  const handleOpenSubjectEdit = async (id: string) => {
    setIsLoading(true);
    const subjects = await getStudentTypeSubjects(id);
    setTypeSubjects(subjects.map(s => s.subject_name));
    setSubjectEditingId(id);
    setIsLoading(false);
  };

  const handleAddSubject = (subject: string) => {
    if (subject && !typeSubjects.includes(subject)) {
      setTypeSubjects([...typeSubjects, subject]);
    }
    setNewSubject('');
  };

  const handleRemoveSubject = (subject: string) => {
    setTypeSubjects(typeSubjects.filter(s => s !== subject));
  };

  const handleSaveSubjects = async () => {
    if (!subjectEditingId) return;

    setIsLoading(true);
    const result = await setStudentTypeSubjects(subjectEditingId, typeSubjects);

    if (result.success) {
      setSubjectEditingId(null);
      setTypeSubjects([]);
    }
    setIsLoading(false);
  };

  const getBranchName = (branchId: string | null) => {
    if (!branchId) return '전체';
    const branch = branches.find(b => b.id === branchId);
    return branch?.name || '알 수 없음';
  };

  const totalStudents = types.reduce((sum, t) => sum + t.studentCount, 0) + unassignedCount;

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">학생 타입 관리</h1>
          <p className="text-gray-500 mt-1">학생 분류 및 주간 목표 시간을 설정합니다.</p>
        </div>
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          타입 추가
        </Button>
      </div>

      {/* 추가 폼 */}
      {showAddForm && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4">새 학생 타입 추가</h3>
          <div className="grid grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">타입명 *</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="예: 재수생"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">주간 목표 (시간)</label>
              <Input
                type="number"
                value={newGoalHours}
                onChange={(e) => setNewGoalHours(e.target.value)}
                placeholder="40"
                min="1"
                max="168"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">지점</label>
              <select
                value={newBranchId}
                onChange={(e) => setNewBranchId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">전체 지점</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleAdd}
                disabled={isLoading || !newName.trim()}
              >
                추가
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setNewName('');
                  setNewGoalHours('40');
                  setNewBranchId('');
                }}
              >
                취소
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-500">전체 타입</div>
          <div className="text-2xl font-bold text-gray-800">{types.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">배정된 학생</div>
          <div className="text-2xl font-bold text-green-600">{totalStudents - unassignedCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">미배정 학생</div>
          <div className="text-2xl font-bold text-amber-500">{unassignedCount}</div>
        </Card>
      </div>

      {/* 과목 설정 모달 */}
      {subjectEditingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg p-6 m-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">선택 가능 과목 설정</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSubjectEditingId(null);
                  setTypeSubjects([]);
                }}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* 기본 과목 빠른 추가 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">기본 과목 추가</label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_SUBJECTS.map(subject => (
                  <Button
                    key={subject}
                    variant={typeSubjects.includes(subject) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      if (typeSubjects.includes(subject)) {
                        handleRemoveSubject(subject);
                      } else {
                        handleAddSubject(subject);
                      }
                    }}
                  >
                    {subject}
                    {typeSubjects.includes(subject) && <Check className="w-3 h-3 ml-1" />}
                  </Button>
                ))}
              </div>
            </div>

            {/* 커스텀 과목 추가 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">커스텀 과목 추가</label>
              <div className="flex gap-2">
                <Input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="과목명 입력"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddSubject(newSubject);
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => handleAddSubject(newSubject)}
                  disabled={!newSubject.trim()}
                >
                  추가
                </Button>
              </div>
            </div>

            {/* 선택된 과목 목록 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                선택된 과목 ({typeSubjects.length})
              </label>
              <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-gray-50 rounded-xl">
                {typeSubjects.length === 0 ? (
                  <span className="text-gray-400 text-sm">과목을 선택해주세요</span>
                ) : (
                  typeSubjects.map(subject => (
                    <span
                      key={subject}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                    >
                      {subject}
                      <button
                        onClick={() => handleRemoveSubject(subject)}
                        className="hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* 저장 버튼 */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSubjectEditingId(null);
                  setTypeSubjects([]);
                }}
              >
                취소
              </Button>
              <Button
                onClick={handleSaveSubjects}
                disabled={isLoading}
              >
                저장
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 타입 목록 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">학생 타입 목록</h2>
        <div className="space-y-3">
          {types.length === 0 ? (
            <Card className="p-6 text-center text-gray-500">
              등록된 학생 타입이 없습니다.
            </Card>
          ) : (
            types.map(type => (
              <Card key={type.id} className="p-4">
                {editingId === type.id ? (
                  <div className="grid grid-cols-4 gap-4 items-end">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">타입명</label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">주간 목표 (시간)</label>
                      <Input
                        type="number"
                        value={editGoalHours}
                        onChange={(e) => setEditGoalHours(e.target.value)}
                        min="1"
                        max="168"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">지점</label>
                      <select
                        value={editBranchId}
                        onChange={(e) => setEditBranchId(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">전체 지점</option>
                        {branches.map(branch => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSaveEdit(type.id)}
                        disabled={isLoading}
                      >
                        저장
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <GraduationCap className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">{type.name}</h3>
                        <p className="text-sm text-gray-500">{getBranchName(type.branch_id)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2 text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>주 {type.weekly_goal_hours}시간</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <Users className="w-4 h-4" />
                        <span>{type.studentCount}명</span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenSubjectEdit(type.id)}
                          title="과목 설정"
                        >
                          <BookOpen className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(type)}
                          title="수정"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(type.id)}
                          className="text-red-500 hover:text-red-600"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
