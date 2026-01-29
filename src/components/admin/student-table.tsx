'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setStudentSubject } from '@/lib/actions/admin';
import {
  User,
  Clock,
  BookOpen,
  Brain,
  Edit3,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Student {
  id: string;
  seatNumber: number | null;
  name: string;
  email: string;
  phone: string;
  status: 'checked_in' | 'checked_out' | 'on_break';
  checkInTime: string | null;
  totalStudySeconds: number;
  currentSubject: string | null;
  avgFocus: number | null;
}

interface StudentTableProps {
  students: Student[];
}

const statusConfig = {
  checked_in: { label: '입실', color: 'bg-success text-green-800' },
  checked_out: { label: '퇴실', color: 'bg-gray-100 text-gray-600' },
  on_break: { label: '외출', color: 'bg-warning text-yellow-800' },
};

const subjectList = ['국어', '수학', '영어', '과학', '사회', '기타'];

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}시간 ${minutes}분`;
}

function formatCheckInTime(timestamp: string | null): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function StudentTable({ students }: StudentTableProps) {
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubjectEdit = (studentId: string, currentSubject: string | null) => {
    setEditingSubject(studentId);
    setSelectedSubject(currentSubject || '');
  };

  const handleSubjectSave = async (studentId: string) => {
    if (!selectedSubject) return;
    
    setLoading(true);
    try {
      await setStudentSubject(studentId, selectedSubject);
    } catch (error) {
      console.error('Failed to set subject:', error);
    } finally {
      setLoading(false);
      setEditingSubject(null);
      setSelectedSubject('');
    }
  };

  const handleSubjectCancel = () => {
    setEditingSubject(null);
    setSelectedSubject('');
  };

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">좌석</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이름</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">상태</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">입실시간</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">학습시간</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">현재 과목</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">몰입도</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-text-muted">
                  등록된 학생이 없습니다.
                </td>
              </tr>
            ) : (
              students.map((student) => {
                const isNoSubject = student.status === 'checked_in' && !student.currentSubject;
                
                return (
                  <tr
                    key={student.id}
                    className={cn(
                      'hover:bg-gray-50 transition-colors',
                      isNoSubject && 'bg-warning/10'
                    )}
                  >
                    {/* 좌석 */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary">
                        {student.seatNumber || '-'}
                      </span>
                    </td>

                    {/* 이름 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-medium">{student.name}</span>
                      </div>
                    </td>

                    {/* 상태 */}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-2 py-1 rounded-full text-xs font-medium',
                          statusConfig[student.status].color
                        )}
                      >
                        {statusConfig[student.status].label}
                      </span>
                    </td>

                    {/* 입실시간 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-text-muted">
                        <Clock className="w-4 h-4" />
                        {formatCheckInTime(student.checkInTime)}
                      </div>
                    </td>

                    {/* 학습시간 */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium">
                        {formatTime(student.totalStudySeconds)}
                      </span>
                    </td>

                    {/* 현재 과목 */}
                    <td className="px-4 py-3">
                      {editingSubject === student.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedSubject}
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            className="px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            <option value="">선택</option>
                            {subjectList.map((subject) => (
                              <option key={subject} value={subject}>
                                {subject}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleSubjectSave(student.id)}
                            disabled={loading || !selectedSubject}
                            className="p-1 text-success hover:bg-success/10 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleSubjectCancel}
                            className="p-1 text-error hover:bg-error/10 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {student.currentSubject ? (
                            <div className="flex items-center gap-1">
                              <BookOpen className="w-4 h-4 text-accent" />
                              <span className="text-sm">{student.currentSubject}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-warning">
                              <AlertCircle className="w-4 h-4" />
                              <span className="text-sm">미설정</span>
                            </div>
                          )}
                          {student.status === 'checked_in' && (
                            <button
                              onClick={() => handleSubjectEdit(student.id, student.currentSubject)}
                              className="p-1 text-text-muted hover:text-primary hover:bg-primary/10 rounded"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 몰입도 */}
                    <td className="px-4 py-3">
                      {student.avgFocus !== null ? (
                        <div className="flex items-center gap-1">
                          <Brain className="w-4 h-4 text-secondary" />
                          <span className="text-sm font-medium">{student.avgFocus}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-text-muted">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
