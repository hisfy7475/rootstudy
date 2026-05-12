'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  Check,
  Target,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from 'lucide-react';
import {
  createStudentType,
  updateStudentType,
  deleteStudentType,
  getStudentTypeSubjects,
  setStudentTypeSubjects,
  getWeeklyGoalSettings,
  getDateTypesForBranch,
  saveWeeklyGoalSettingsBatch,
  type WeeklyGoalSettingWithDateType,
} from '@/lib/actions/student-type';
import type { StudentType, DateTypeDefinition } from '@/types/database';
import { DEFAULT_SUBJECTS } from '@/lib/constants';

interface StudentTypeWithCount extends StudentType {
  studentCount: number;
}

interface StudentTypesClientProps {
  initialTypes: StudentTypeWithCount[];
  adminBranchId: string | null;
  isSuperAdmin: boolean;
  branches: { id: string; name: string }[];
  unassignedCount: number;
}

export default function StudentTypesClient({
  initialTypes,
  adminBranchId,
  isSuperAdmin,
  branches,
  unassignedCount,
}: StudentTypesClientProps) {
  const [types, setTypes] = useState(initialTypes);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [subjectEditingId, setSubjectEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 새 타입 추가 폼
  const [newName, setNewName] = useState('');
  const [newGoalHours, setNewGoalHours] = useState('40');

  // 수정 폼
  const [editName, setEditName] = useState('');
  const [editGoalHours, setEditGoalHours] = useState('');

  // 과목 설정
  const [typeSubjects, setTypeSubjects] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState('');

  // 주간 목표 설정 (투트랙 지원)
  const [goalEditingId, setGoalEditingId] = useState<string | null>(null);
  const [goalEditingName, setGoalEditingName] = useState('');
  // 슈퍼관리자가 어느 지점 정책을 편집할지 선택 (일반 관리자는 자기 지점 자동)
  const [selectedBranchForGoal, setSelectedBranchForGoal] = useState<string>(
    adminBranchId ?? branches[0]?.id ?? '',
  );
  const [dateTypes, setDateTypes] = useState<DateTypeDefinition[]>([]);
  const [goalSettings, setGoalSettings] = useState<
    Record<
      string,
      {
        weekly_goal_hours: number;
        reward_points: number;
        minimum_hours: number;
        minimum_penalty_points: number;
      }
    >
  >({});

  const handleAdd = async () => {
    if (!newName.trim()) return;

    setIsLoading(true);
    const result = await createStudentType({
      name: newName.trim(),
      weekly_goal_hours: parseInt(newGoalHours) || 40,
    });

    if (result.success && result.data) {
      setTypes([...types, { ...result.data, studentCount: 0 }]);
      setNewName('');
      setNewGoalHours('40');
      setShowAddForm(false);
    }
    setIsLoading(false);
  };

  const handleEdit = (type: StudentTypeWithCount) => {
    setEditingId(type.id);
    setEditName(type.name);
    setEditGoalHours(type.weekly_goal_hours.toString());
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;

    // weekly_goal_hours 는 신규 student_type 생성 시의 seed 값이며,
    // 현재 학기중/방학별 목표 시간은 weekly_goal_settings 가 SSOT.
    // 카드에서 이 값을 바꿔도 기존 학생들의 학기/방학별 목표시간에는 영향이 없음을 명시.
    const original = types.find((t) => t.id === id);
    const newHours = parseInt(editGoalHours) || 40;
    if (original && original.weekly_goal_hours !== newHours) {
      const ok = window.confirm(
        '주간 목표(시간) 값은 신규 학생 타입 생성 시의 기본값으로만 쓰입니다.\n' +
          '현재 학기중/방학별 목표 시간을 변경하려면 "목표 설정"(Target) 버튼을 사용하세요.\n\n' +
          '그래도 이 기본값을 변경하시겠습니까?',
      );
      if (!ok) return;
    }

    setIsLoading(true);
    const result = await updateStudentType(id, {
      name: editName.trim(),
      weekly_goal_hours: newHours,
    });

    if (result.success) {
      setTypes(
        types.map((t) =>
          t.id === id
            ? {
                ...t,
                name: editName.trim(),
                weekly_goal_hours: newHours,
              }
            : t,
        ),
      );
      setEditingId(null);
    }
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm('이 학생 타입을 삭제하시겠습니까? 해당 타입에 속한 학생들의 타입이 초기화됩니다.')
    ) {
      return;
    }

    setIsLoading(true);
    const result = await deleteStudentType(id);

    if (result.success) {
      setTypes(types.filter((t) => t.id !== id));
    }
    setIsLoading(false);
  };

  const handleOpenSubjectEdit = async (id: string) => {
    setIsLoading(true);
    const subjects = await getStudentTypeSubjects(id);
    // sort_order 순으로 정렬된 과목명 배열
    setTypeSubjects(subjects.map((s) => s.subject_name));
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
    setTypeSubjects(typeSubjects.filter((s) => s !== subject));
  };

  // 과목 순서 이동
  const handleMoveSubject = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= typeSubjects.length) return;

    const newSubjects = [...typeSubjects];
    [newSubjects[index], newSubjects[newIndex]] = [newSubjects[newIndex], newSubjects[index]];
    setTypeSubjects(newSubjects);
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

  // 주간 목표 설정 모달 열기 (투트랙 지원)
  // - 일반 관리자: 자기 지점의 date_type 자동 로드
  // - 슈퍼관리자: 모달 안 지점 선택 드롭다운으로 어느 지점 정책 편집할지 결정
  const handleOpenGoalEdit = async (type: StudentTypeWithCount) => {
    // 슈퍼관리자가 아닌데 지점 미배정이면 차단 (기존 동작 유지)
    if (!isSuperAdmin && !adminBranchId) {
      alert('관리자의 소속 지점이 설정되지 않았습니다. 먼저 지점을 배정받으세요.');
      return;
    }
    if (isSuperAdmin && branches.length === 0) {
      alert('등록된 지점이 없습니다. 먼저 지점을 생성해주세요.');
      return;
    }

    setIsLoading(true);

    // 편집 대상 지점: 일반관리자=자기지점, 슈퍼관리자=드롭다운 선택값 (초기엔 첫 번째 지점)
    const targetBranchId = adminBranchId ?? selectedBranchForGoal ?? branches[0]?.id ?? '';
    setSelectedBranchForGoal(targetBranchId);
    // 관리자의 지점 날짜 타입들 조회
    const dateTypeList = await getDateTypesForBranch(targetBranchId);
    setDateTypes(dateTypeList);

    // 기존 설정 조회
    const existingSettings = await getWeeklyGoalSettings(type.id);

    // 설정을 객체로 변환 (투트랙 지원)
    const settingsMap: Record<
      string,
      {
        weekly_goal_hours: number;
        reward_points: number;
        minimum_hours: number;
        minimum_penalty_points: number;
      }
    > = {};

    // 모든 날짜 타입에 대해 기본값 설정
    dateTypeList.forEach((dt) => {
      settingsMap[dt.id] = {
        weekly_goal_hours: type.weekly_goal_hours, // 기본값으로 학생타입의 주간목표 사용
        reward_points: 1,
        minimum_hours: 0,
        minimum_penalty_points: 0,
      };
    });

    // 기존 설정으로 덮어쓰기
    existingSettings.forEach((s) => {
      settingsMap[s.date_type_id] = {
        weekly_goal_hours: s.weekly_goal_hours,
        reward_points: s.reward_points,
        minimum_hours: s.minimum_hours || 0,
        minimum_penalty_points: s.minimum_penalty_points || 0,
      };
    });

    setGoalSettings(settingsMap);
    setGoalEditingId(type.id);
    setGoalEditingName(type.name);
    setIsLoading(false);
  };

  // 주간 목표 설정 저장 (투트랙 지원)
  const handleSaveGoalSettings = async () => {
    if (!goalEditingId) return;

    setIsLoading(true);

    const settings = Object.entries(goalSettings).map(([dateTypeId, setting]) => ({
      date_type_id: dateTypeId,
      weekly_goal_hours: setting.weekly_goal_hours,
      reward_points: setting.reward_points,
      penalty_points: 0, // deprecated, 기존 호환을 위해 0으로 설정
      minimum_hours: setting.minimum_hours,
      minimum_penalty_points: setting.minimum_penalty_points,
    }));

    // prune 범위를 현재 모달이 로드한 한 지점의 date_type 으로 제한.
    // 다른 지점의 weekly_goal_settings 가 함께 삭제되는 데이터 손실 방지.
    const inScopeDateTypeIds = dateTypes.map((dt) => dt.id);
    const result = await saveWeeklyGoalSettingsBatch(goalEditingId, settings, inScopeDateTypeIds);

    if (result.success) {
      setGoalEditingId(null);
      setGoalEditingName('');
      setDateTypes([]);
      setGoalSettings({});
    }
    setIsLoading(false);
  };

  // 목표 설정 값 변경 (투트랙 지원)
  const handleGoalSettingChange = (
    dateTypeId: string,
    field: 'weekly_goal_hours' | 'reward_points' | 'minimum_hours' | 'minimum_penalty_points',
    value: number,
  ) => {
    setGoalSettings((prev) => ({
      ...prev,
      [dateTypeId]: {
        ...prev[dateTypeId],
        [field]: value,
      },
    }));
  };

  const totalStudents = types.reduce((sum, t) => sum + t.studentCount, 0) + unassignedCount;

  return (
    <div className='space-y-6 p-6'>
      {/* 헤더 */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-gray-800'>학생 타입 관리</h1>
          <p className='mt-1 text-gray-500'>학생 분류 및 주간 목표 시간을 설정합니다.</p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} className='flex items-center gap-2'>
          <Plus className='h-4 w-4' />
          타입 추가
        </Button>
      </div>

      {/* 추가 폼 */}
      {showAddForm && (
        <Card className='p-4'>
          <h3 className='mb-4 font-semibold'>새 학생 타입 추가</h3>
          <div className='grid grid-cols-3 items-end gap-4'>
            <div>
              <label className='mb-1 block text-sm font-medium text-gray-700'>타입명 *</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder='예: 재수생'
              />
            </div>
            <div>
              <label className='mb-1 block text-sm font-medium text-gray-700'>
                주간 목표 (시간)
              </label>
              <Input
                type='number'
                value={newGoalHours}
                onChange={(e) => setNewGoalHours(e.target.value)}
                placeholder='40'
                min='1'
                max='168'
              />
            </div>
            <div className='flex gap-2'>
              <Button onClick={handleAdd} disabled={isLoading || !newName.trim()}>
                추가
              </Button>
              <Button
                variant='outline'
                onClick={() => {
                  setShowAddForm(false);
                  setNewName('');
                  setNewGoalHours('40');
                }}
              >
                취소
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 통계 */}
      <div className='grid grid-cols-3 gap-4'>
        <Card className='p-4'>
          <div className='text-sm text-gray-500'>전체 타입</div>
          <div className='text-2xl font-bold text-gray-800'>{types.length}</div>
        </Card>
        <Card className='p-4'>
          <div className='text-sm text-gray-500'>배정된 학생</div>
          <div className='text-2xl font-bold text-green-600'>{totalStudents - unassignedCount}</div>
        </Card>
        <Link
          href='/admin/members?studentType=unassigned'
          className='focus-visible:ring-primary block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
          aria-label={`미배정 학생 ${unassignedCount}명, 회원 관리로 이동`}
        >
          <Card className='h-full cursor-pointer p-4 transition-colors hover:bg-amber-50/60'>
            <div className='text-sm text-gray-500'>미배정 학생</div>
            <div className='text-2xl font-bold text-amber-500'>{unassignedCount}</div>
          </Card>
        </Link>
      </div>

      {/* 과목 설정 모달 */}
      {subjectEditingId && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
          <Card className='m-4 w-full max-w-lg p-6'>
            <div className='mb-4 flex items-center justify-between'>
              <h3 className='text-lg font-semibold'>선택 가능 과목 설정</h3>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  setSubjectEditingId(null);
                  setTypeSubjects([]);
                }}
              >
                <X className='h-5 w-5' />
              </Button>
            </div>

            {/* 기본 과목 빠른 추가 */}
            <div className='mb-4'>
              <label className='mb-2 block text-sm font-medium text-gray-700'>기본 과목 추가</label>
              <div className='flex flex-wrap gap-2'>
                {DEFAULT_SUBJECTS.map((subject) => (
                  <Button
                    key={subject}
                    variant={typeSubjects.includes(subject) ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => {
                      if (typeSubjects.includes(subject)) {
                        handleRemoveSubject(subject);
                      } else {
                        handleAddSubject(subject);
                      }
                    }}
                  >
                    {subject}
                    {typeSubjects.includes(subject) && <Check className='ml-1 h-3 w-3' />}
                  </Button>
                ))}
              </div>
            </div>

            {/* 커스텀 과목 추가 */}
            <div className='mb-4'>
              <label className='mb-2 block text-sm font-medium text-gray-700'>
                커스텀 과목 추가
              </label>
              <div className='flex gap-2'>
                <Input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder='과목명 입력'
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddSubject(newSubject);
                    }
                  }}
                />
                <Button
                  variant='outline'
                  onClick={() => handleAddSubject(newSubject)}
                  disabled={!newSubject.trim()}
                >
                  추가
                </Button>
              </div>
            </div>

            {/* 선택된 과목 목록 (순서 변경 가능) */}
            <div className='mb-6'>
              <label className='mb-2 block text-sm font-medium text-gray-700'>
                선택된 과목 ({typeSubjects.length}) - 순서 변경 가능
              </label>
              <div className='min-h-[40px] space-y-2 rounded-xl bg-gray-50 p-3'>
                {typeSubjects.length === 0 ? (
                  <span className='text-sm text-gray-400'>과목을 선택해주세요</span>
                ) : (
                  typeSubjects.map((subject, index) => (
                    <div
                      key={subject}
                      className='flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2'
                    >
                      <div className='flex items-center gap-2'>
                        <GripVertical className='h-4 w-4 text-gray-400' />
                        <span className='w-5 text-sm text-gray-500'>{index + 1}</span>
                        <span className='text-sm font-medium'>{subject}</span>
                      </div>
                      <div className='flex items-center gap-1'>
                        <button
                          onClick={() => handleMoveSubject(index, 'up')}
                          disabled={index === 0}
                          className='rounded p-1 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30'
                          title='위로 이동'
                        >
                          <ChevronUp className='h-4 w-4' />
                        </button>
                        <button
                          onClick={() => handleMoveSubject(index, 'down')}
                          disabled={index === typeSubjects.length - 1}
                          className='rounded p-1 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30'
                          title='아래로 이동'
                        >
                          <ChevronDown className='h-4 w-4' />
                        </button>
                        <button
                          onClick={() => handleRemoveSubject(subject)}
                          className='rounded p-1 hover:bg-red-50 hover:text-red-500'
                          title='삭제'
                        >
                          <X className='h-4 w-4' />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 저장 버튼 */}
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  setSubjectEditingId(null);
                  setTypeSubjects([]);
                }}
              >
                취소
              </Button>
              <Button onClick={handleSaveSubjects} disabled={isLoading}>
                저장
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 주간 목표 설정 모달 */}
      {goalEditingId && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
          <Card className='m-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6'>
            <div className='mb-4 flex items-center justify-between'>
              <div>
                <h3 className='text-lg font-semibold'>주간 목표 설정</h3>
                <p className='text-sm text-gray-500'>
                  {goalEditingName} - 날짜 타입별 목표시간/상벌점
                </p>
              </div>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  setGoalEditingId(null);
                  setGoalEditingName('');
                  setDateTypes([]);
                  setGoalSettings({});
                }}
              >
                <X className='h-5 w-5' />
              </Button>
            </div>

            {/* 슈퍼관리자: 어느 지점 정책을 편집할지 선택 */}
            {isSuperAdmin && branches.length > 1 && (
              <div className='mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3'>
                <label className='mb-1 block text-xs font-medium text-amber-900'>
                  편집 대상 지점 (지점별로 학기중/방학 정책이 분리돼 있습니다)
                </label>
                <select
                  className='w-full rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm'
                  value={selectedBranchForGoal}
                  onChange={async (e) => {
                    const newBranchId = e.target.value;
                    setSelectedBranchForGoal(newBranchId);
                    setIsLoading(true);
                    const dateTypeList = await getDateTypesForBranch(newBranchId);
                    setDateTypes(dateTypeList);
                    // 기본값 초기화 (기존 설정은 student_type 기준 공통이라 그대로 유지)
                    const existingSettings = await getWeeklyGoalSettings(goalEditingId!);
                    const settingsMap: Record<
                      string,
                      {
                        weekly_goal_hours: number;
                        reward_points: number;
                        minimum_hours: number;
                        minimum_penalty_points: number;
                      }
                    > = {};
                    const fallback =
                      types.find((t) => t.id === goalEditingId)?.weekly_goal_hours ?? 40;
                    dateTypeList.forEach((dt) => {
                      settingsMap[dt.id] = {
                        weekly_goal_hours: fallback,
                        reward_points: 1,
                        minimum_hours: 0,
                        minimum_penalty_points: 0,
                      };
                    });
                    existingSettings.forEach((s) => {
                      if (settingsMap[s.date_type_id]) {
                        settingsMap[s.date_type_id] = {
                          weekly_goal_hours: s.weekly_goal_hours,
                          reward_points: s.reward_points,
                          minimum_hours: s.minimum_hours || 0,
                          minimum_penalty_points: s.minimum_penalty_points || 0,
                        };
                      }
                    });
                    setGoalSettings(settingsMap);
                    setIsLoading(false);
                  }}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {dateTypes.length === 0 ? (
              <div className='py-8 text-center text-gray-500'>
                <p>현재 지점에 등록된 날짜 타입이 없습니다.</p>
                <p className='mt-1 text-sm'>먼저 날짜 타입 관리에서 날짜 타입을 추가해주세요.</p>
              </div>
            ) : (
              <>
                {/* 테이블 헤더 - 투트랙 */}
                <div className='mb-2 grid grid-cols-5 gap-3 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600'>
                  <div>날짜 타입</div>
                  <div className='text-center'>주간 목표 (시간)</div>
                  <div className='text-center'>달성 상점</div>
                  <div className='text-center'>최소 시간</div>
                  <div className='text-center'>미달 벌점</div>
                </div>

                {/* 설정 행 - 투트랙 */}
                <div className='space-y-2'>
                  {dateTypes.map((dt) => (
                    <div
                      key={dt.id}
                      className='grid grid-cols-5 items-center gap-3 rounded-lg bg-gray-50 px-3 py-3'
                    >
                      <div className='flex items-center gap-2'>
                        <div
                          className='h-3 w-3 rounded-full'
                          style={{ backgroundColor: dt.color }}
                        />
                        <span className='font-medium text-gray-800'>{dt.name}</span>
                      </div>
                      <div>
                        <Input
                          type='number'
                          min='0'
                          max='168'
                          value={goalSettings[dt.id]?.weekly_goal_hours ?? 40}
                          onChange={(e) =>
                            handleGoalSettingChange(
                              dt.id,
                              'weekly_goal_hours',
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className='text-center'
                        />
                      </div>
                      <div>
                        <Input
                          type='number'
                          min='0'
                          max='100'
                          value={goalSettings[dt.id]?.reward_points ?? 1}
                          onChange={(e) =>
                            handleGoalSettingChange(
                              dt.id,
                              'reward_points',
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className='text-center'
                        />
                      </div>
                      <div>
                        <Input
                          type='number'
                          min='0'
                          max='168'
                          value={goalSettings[dt.id]?.minimum_hours ?? 0}
                          onChange={(e) =>
                            handleGoalSettingChange(
                              dt.id,
                              'minimum_hours',
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className='text-center'
                        />
                      </div>
                      <div>
                        <Input
                          type='number'
                          min='0'
                          max='100'
                          value={goalSettings[dt.id]?.minimum_penalty_points ?? 0}
                          onChange={(e) =>
                            handleGoalSettingChange(
                              dt.id,
                              'minimum_penalty_points',
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className='text-center'
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className='mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700'>
                  <p>
                    <strong>안내:</strong> 매주 일요일 자정에 주간 목표 달성 여부를 체크합니다.
                  </p>
                  <p className='mt-1'>• 목표 달성 시 → 상점 부여</p>
                  <p>• 최소 미달 시 → 벌점 부여</p>
                  <p>• 중간 (최소 이상, 목표 미만) → 상벌점 없음</p>
                </div>
              </>
            )}

            {/* 저장 버튼 */}
            <div className='mt-6 flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  setGoalEditingId(null);
                  setGoalEditingName('');
                  setDateTypes([]);
                  setGoalSettings({});
                }}
              >
                취소
              </Button>
              <Button
                onClick={handleSaveGoalSettings}
                disabled={isLoading || dateTypes.length === 0}
              >
                저장
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 타입 목록 */}
      <div>
        <h2 className='mb-3 text-lg font-semibold text-gray-800'>학생 타입 목록</h2>
        <div className='space-y-3'>
          {types.length === 0 ? (
            <Card className='p-6 text-center text-gray-500'>등록된 학생 타입이 없습니다.</Card>
          ) : (
            types.map((type) => (
              <Card key={type.id} className='p-4'>
                {editingId === type.id ? (
                  <div className='grid grid-cols-3 items-end gap-4'>
                    <div>
                      <label className='mb-1 block text-sm font-medium text-gray-700'>타입명</label>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    <div>
                      <label className='mb-1 block text-sm font-medium text-gray-700'>
                        주간 목표 (시간)
                      </label>
                      <Input
                        type='number'
                        value={editGoalHours}
                        onChange={(e) => setEditGoalHours(e.target.value)}
                        min='1'
                        max='168'
                      />
                    </div>
                    <div className='flex gap-2'>
                      <Button onClick={() => handleSaveEdit(type.id)} disabled={isLoading}>
                        저장
                      </Button>
                      <Button variant='outline' onClick={() => setEditingId(null)}>
                        취소
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-4'>
                      <div className='bg-primary/10 flex h-12 w-12 items-center justify-center rounded-xl'>
                        <GraduationCap className='text-primary h-6 w-6' />
                      </div>
                      <div>
                        <h3 className='font-semibold text-gray-800'>{type.name}</h3>
                      </div>
                    </div>
                    <div className='flex items-center gap-6'>
                      <div
                        className='flex items-center gap-2 text-gray-500'
                        title='신규 타입 생성 시의 기본값. 학기/방학별 목표 시간은 Target 버튼에서 설정.'
                      >
                        <Clock className='h-4 w-4' />
                        <span>
                          주 {type.weekly_goal_hours}시간{' '}
                          <span className='text-xs text-gray-400'>(기본값)</span>
                        </span>
                      </div>
                      <div className='flex items-center gap-2 text-gray-500'>
                        <Users className='h-4 w-4' />
                        <span>{type.studentCount}명</span>
                      </div>
                      <div className='flex gap-1'>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => handleOpenGoalEdit(type)}
                          title='목표 설정'
                        >
                          <Target className='h-4 w-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => handleOpenSubjectEdit(type.id)}
                          title='과목 설정'
                        >
                          <BookOpen className='h-4 w-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => handleEdit(type)}
                          title='수정'
                        >
                          <Pencil className='h-4 w-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => handleDelete(type.id)}
                          className='text-red-500 hover:text-red-600'
                          title='삭제'
                        >
                          <Trash2 className='h-4 w-4' />
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
