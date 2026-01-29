'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { recordFocusScore, getAllStudents, getWeeklyFocusReport } from '@/lib/actions/admin';
import {
  Brain,
  User,
  Sparkles,
  Monitor,
  Moon,
  Check,
  RefreshCw,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Student {
  id: string;
  seatNumber: number | null;
  name: string;
  status: 'checked_in' | 'checked_out' | 'on_break';
  currentSubject: string | null;
  avgFocus: number | null;
}

interface FocusReport {
  id: string;
  seatNumber: number | null;
  name: string;
  dailyScores: { [key: string]: number[] };
  weeklyAvg: number | null;
  totalRecords: number;
}

interface FocusClientProps {
  initialStudents: Student[];
  initialReport: FocusReport[];
}

const quickScoreButtons = [
  { score: 10, label: '완전몰입', icon: Sparkles, color: 'bg-success hover:bg-success/90' },
  { score: 8, label: '인강', icon: Monitor, color: 'bg-primary hover:bg-primary/90' },
  { score: 5, label: '졸음', icon: Moon, color: 'bg-warning hover:bg-warning/90' },
];

export function FocusClient({ initialStudents, initialReport }: FocusClientProps) {
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [report, setReport] = useState<FocusReport[]>(initialReport);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [customScore, setCustomScore] = useState<string>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleQuickScore = async (studentId: string, score: number) => {
    setLoading(true);
    try {
      const result = await recordFocusScore(studentId, score);
      if (result.success) {
        showSuccess(`${score}점 기록 완료`);
        await refreshData();
      }
    } catch (error) {
      console.error('Failed to record score:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomScore = async () => {
    if (!selectedStudent || !customScore) return;
    
    const score = parseInt(customScore);
    if (isNaN(score) || score < 1 || score > 10) {
      alert('1~10 사이의 점수를 입력하세요');
      return;
    }

    setLoading(true);
    try {
      const result = await recordFocusScore(selectedStudent, score, note || undefined);
      if (result.success) {
        showSuccess(`${score}점 기록 완료`);
        setSelectedStudent(null);
        setCustomScore('');
        setNote('');
        await refreshData();
      }
    } catch (error) {
      console.error('Failed to record score:', error);
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const refreshData = async () => {
    const [newStudents, newReport] = await Promise.all([
      getAllStudents('checked_in'),
      getWeeklyFocusReport(),
    ]);
    setStudents(newStudents);
    setReport(newReport);
  };

  // 주간 날짜 헤더 생성
  const today = new Date();
  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek);
  
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return {
      date: date.toISOString().split('T')[0],
      label: ['일', '월', '화', '수', '목', '금', '토'][i],
      isToday: date.toISOString().split('T')[0] === today.toISOString().split('T')[0],
    };
  });

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">몰입도 관리</h1>
          <p className="text-text-muted mt-1">학생들의 학습 몰입도를 기록하세요</p>
        </div>
        <Button variant="outline" onClick={refreshData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* 성공 메시지 */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-success text-green-800 px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-top">
          <Check className="w-4 h-4" />
          {successMessage}
        </div>
      )}

      {/* 입실 중인 학생 빠른 점수 입력 */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-secondary" />
          빠른 점수 입력 (입실 중인 학생)
        </h2>
        
        {students.length === 0 ? (
          <p className="text-text-muted text-center py-8">현재 입실 중인 학생이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {students.map((student) => (
              <div
                key={student.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-primary font-medium">
                        {student.seatNumber || '-'}번
                      </span>
                      <span className="font-medium">{student.name}</span>
                    </div>
                    <span className="text-xs text-text-muted">
                      {student.currentSubject || '과목 미설정'}
                      {student.avgFocus !== null && ` · 오늘 평균 ${student.avgFocus}점`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* 빠른 점수 버튼 */}
                  {quickScoreButtons.map((btn) => (
                    <Button
                      key={btn.score}
                      size="sm"
                      className={cn('text-white', btn.color)}
                      onClick={() => handleQuickScore(student.id, btn.score)}
                      disabled={loading}
                    >
                      <btn.icon className="w-4 h-4 mr-1" />
                      {btn.label}
                    </Button>
                  ))}
                  
                  {/* 직접 입력 버튼 */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedStudent(
                      selectedStudent === student.id ? null : student.id
                    )}
                  >
                    직접 입력
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 직접 입력 폼 */}
        {selectedStudent && (
          <div className="mt-4 p-4 border border-gray-200 rounded-xl">
            <h3 className="font-medium mb-3">
              {students.find(s => s.id === selectedStudent)?.name} 점수 입력
            </h3>
            <div className="flex gap-3">
              <Input
                type="number"
                min="1"
                max="10"
                placeholder="점수 (1-10)"
                value={customScore}
                onChange={(e) => setCustomScore(e.target.value)}
                className="w-32"
              />
              <Input
                placeholder="메모 (선택)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleCustomScore} disabled={loading || !customScore}>
                기록
              </Button>
              <Button variant="outline" onClick={() => setSelectedStudent(null)}>
                취소
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 주간 몰입도 리포트 */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">주간 몰입도 리포트</h2>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            엑셀 다운로드
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">학생</th>
                {weekDays.map((day) => (
                  <th
                    key={day.date}
                    className={cn(
                      'px-4 py-3 text-center text-sm font-medium',
                      day.isToday ? 'text-primary bg-primary/5' : 'text-text-muted'
                    )}
                  >
                    {day.label}
                    <br />
                    <span className="text-xs">{day.date.slice(5)}</span>
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-sm font-medium text-text-muted">평균</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-text-muted">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                report.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-primary font-medium">
                          {student.seatNumber || '-'}
                        </span>
                        <span>{student.name}</span>
                      </div>
                    </td>
                    {weekDays.map((day) => {
                      const scores = student.dailyScores[day.date] || [];
                      const avg = scores.length > 0
                        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
                        : null;

                      return (
                        <td
                          key={day.date}
                          className={cn(
                            'px-4 py-3 text-center',
                            day.isToday && 'bg-primary/5'
                          )}
                        >
                          {avg !== null ? (
                            <span
                              className={cn(
                                'font-medium',
                                avg >= 8 ? 'text-green-600' :
                                avg >= 6 ? 'text-primary' :
                                avg >= 4 ? 'text-yellow-600' : 'text-red-500'
                              )}
                            >
                              {avg}
                            </span>
                          ) : (
                            <span className="text-text-muted">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      {student.weeklyAvg !== null ? (
                        <span className="font-semibold text-primary">{student.weeklyAvg}</span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
