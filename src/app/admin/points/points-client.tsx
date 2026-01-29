'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { givePoints, getPointsOverview, getAllPointsHistory } from '@/lib/actions/admin';
import {
  Award,
  Plus,
  Minus,
  User,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PointsOverview {
  id: string;
  seatNumber: number | null;
  name: string;
  reward: number;
  penalty: number;
  total: number;
}

interface PointsHistory {
  id: string;
  type: 'reward' | 'penalty';
  amount: number;
  reason: string;
  is_auto: boolean;
  created_at: string;
  studentName: string;
  studentSeatNumber: number | null;
  adminName: string;
}

interface Student {
  id: string;
  seatNumber: number | null;
  name: string;
}

interface PointsClientProps {
  initialOverview: PointsOverview[];
  initialHistory: PointsHistory[];
  students: Student[];
}

type FilterType = 'all' | 'reward' | 'penalty';

export function PointsClient({ initialOverview, initialHistory, students }: PointsClientProps) {
  const [overview, setOverview] = useState<PointsOverview[]>(initialOverview);
  const [history, setHistory] = useState<PointsHistory[]>(initialHistory);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 부여 폼 상태
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [pointType, setPointType] = useState<'reward' | 'penalty'>('reward');
  const [amount, setAmount] = useState<string>('1');
  const [reason, setReason] = useState<string>('');

  const filteredHistory = filter === 'all'
    ? history
    : history.filter(h => h.type === filter);

  const handleSubmit = async () => {
    if (!selectedStudent || !amount || !reason) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    const pointAmount = parseInt(amount);
    if (isNaN(pointAmount) || pointAmount < 1) {
      alert('올바른 점수를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const result = await givePoints(selectedStudent, pointType, pointAmount, reason);
      if (result.success) {
        showSuccess(`${pointType === 'reward' ? '상점' : '벌점'} ${pointAmount}점 부여 완료`);
        resetForm();
        await refreshData();
      }
    } catch (error) {
      console.error('Failed to give points:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setShowAddForm(false);
    setSelectedStudent('');
    setPointType('reward');
    setAmount('1');
    setReason('');
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      const [newOverview, newHistory] = await Promise.all([
        getPointsOverview(),
        getAllPointsHistory(filter === 'all' ? undefined : filter),
      ]);
      setOverview(newOverview);
      setHistory(newHistory);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">상벌점 관리</h1>
          <p className="text-text-muted mt-1">학생들의 상점과 벌점을 관리하세요</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            상벌점 부여
          </Button>
        </div>
      </div>

      {/* 성공 메시지 */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-success text-green-800 px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-top z-50">
          <Check className="w-4 h-4" />
          {successMessage}
        </div>
      )}

      {/* 상벌점 부여 폼 */}
      {showAddForm && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">상벌점 부여</h2>
            <button onClick={resetForm} className="text-text-muted hover:text-text">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 학생 선택 */}
            <div>
              <label className="block text-sm font-medium mb-2">학생</label>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">선택하세요</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.seatNumber || '-'}번 {student.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 유형 선택 */}
            <div>
              <label className="block text-sm font-medium mb-2">유형</label>
              <div className="flex gap-2">
                <Button
                  variant={pointType === 'reward' ? 'default' : 'outline'}
                  className={cn(
                    'flex-1',
                    pointType === 'reward' && 'bg-success hover:bg-success/90'
                  )}
                  onClick={() => setPointType('reward')}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  상점
                </Button>
                <Button
                  variant={pointType === 'penalty' ? 'default' : 'outline'}
                  className={cn(
                    'flex-1',
                    pointType === 'penalty' && 'bg-error hover:bg-error/90'
                  )}
                  onClick={() => setPointType('penalty')}
                >
                  <Minus className="w-4 h-4 mr-1" />
                  벌점
                </Button>
              </div>
            </div>

            {/* 점수 */}
            <div>
              <label className="block text-sm font-medium mb-2">점수</label>
              <Input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="점수"
              />
            </div>

            {/* 사유 */}
            <div>
              <label className="block text-sm font-medium mb-2">사유</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="사유를 입력하세요"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={resetForm}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              부여하기
            </Button>
          </div>
        </Card>
      )}

      {/* 학생별 상벌점 현황 */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" />
          학생별 상벌점 현황
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">좌석</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이름</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-green-600">상점</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-red-500">벌점</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-text-muted">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overview.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                    등록된 학생이 없습니다.
                  </td>
                </tr>
              ) : (
                overview.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary">{student.seatNumber || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <span>{student.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-green-600 font-medium">+{student.reward}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-red-500 font-medium">-{student.penalty}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'font-semibold',
                          student.total >= 0 ? 'text-green-600' : 'text-red-500'
                        )}
                      >
                        {student.total >= 0 ? '+' : ''}{student.total}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 상벌점 내역 */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">상벌점 내역</h2>
          <div className="flex gap-2">
            {(['all', 'reward', 'penalty'] as FilterType[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? '전체' : f === 'reward' ? '상점' : '벌점'}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredHistory.length === 0 ? (
            <p className="text-text-muted text-center py-8">내역이 없습니다.</p>
          ) : (
            filteredHistory.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'p-4 rounded-xl border-l-4',
                  item.type === 'reward'
                    ? 'bg-green-50 border-green-500'
                    : 'bg-red-50 border-red-500'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center',
                        item.type === 'reward' ? 'bg-green-100' : 'bg-red-100'
                      )}
                    >
                      {item.type === 'reward' ? (
                        <Plus className="w-4 h-4 text-green-600" />
                      ) : (
                        <Minus className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {item.studentSeatNumber || '-'}번 {item.studentName}
                        </span>
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            item.type === 'reward' ? 'text-green-600' : 'text-red-500'
                          )}
                        >
                          {item.type === 'reward' ? '+' : '-'}{item.amount}점
                        </span>
                        {item.is_auto && (
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                            자동
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-muted">{item.reason}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-text-muted">{formatDate(item.created_at)}</p>
                    <p className="text-xs text-text-muted">by {item.adminName}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
