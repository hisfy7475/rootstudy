'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, UserPlus, Key, X, CheckCircle, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addChildToParent, removeChildFromParent } from '@/lib/actions/parent';
import { verifyParentCode } from '@/app/(auth)/actions';

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  seatNumber: number | null;
}

interface SettingsClientProps {
  students: Student[];
}

export function SettingsClient({ students: initialStudents }: SettingsClientProps) {
  const [students, setStudents] = useState(initialStudents);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [verifiedStudent, setVerifiedStudent] = useState<{ name: string; id: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function handleVerifyCode() {
    if (!newCode) {
      setError('연결 코드를 입력해주세요.');
      return;
    }

    // 이미 연결된 자녀인지 확인
    if (students.some(s => s.id === verifiedStudent?.id)) {
      setError('이미 연결된 자녀입니다.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    const result = await verifyParentCode(newCode);

    if (result.success && result.data?.studentName && result.data?.studentId) {
      // 이미 연결된 자녀인지 다시 확인
      if (students.some(s => s.id === result.data!.studentId)) {
        setError('이미 연결된 자녀입니다.');
        setIsVerifying(false);
        return;
      }
      setVerifiedStudent({
        name: result.data.studentName,
        id: result.data.studentId,
      });
    } else {
      setError(result.error || '유효하지 않은 연결 코드입니다.');
    }
    setIsVerifying(false);
  }

  async function handleAddChild() {
    if (!verifiedStudent) return;

    startTransition(async () => {
      const result = await addChildToParent(newCode);
      
      if (result.success) {
        // 성공 시 목록에 추가 (실제로는 페이지가 revalidate 됨)
        window.location.reload();
      } else {
        setError(result.error || '자녀 추가에 실패했습니다.');
      }
    });
  }

  function handleCancelAdd() {
    setIsAddingChild(false);
    setNewCode('');
    setVerifiedStudent(null);
    setError(null);
  }

  async function handleRemoveChild(studentId: string) {
    setRemovingId(studentId);
    
    startTransition(async () => {
      const result = await removeChildFromParent(studentId);
      
      if (result.success) {
        setStudents(prev => prev.filter(s => s.id !== studentId));
        setConfirmRemove(null);
      } else {
        setError(result.error || '연결 해제에 실패했습니다.');
      }
      setRemovingId(null);
    });
  }

  return (
    <div className="p-4 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold text-text">자녀 관리</h1>
        <p className="text-sm text-text-muted mt-1">
          연결된 자녀를 관리하고 새로운 자녀를 추가할 수 있습니다.
        </p>
      </div>

      {/* 연결된 자녀 목록 */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-muted">
          연결된 자녀 ({students.length}명)
        </h2>
        
        {students.length === 0 ? (
          <Card className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <User className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-text-muted text-sm">연결된 자녀가 없습니다.</p>
            </div>
          </Card>
        ) : (
          students.map((student) => (
            <Card key={student.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-text">{student.name}</p>
                    <p className="text-xs text-text-muted">
                      {student.seatNumber ? `${student.seatNumber}번 좌석` : '좌석 미배정'}
                    </p>
                  </div>
                </div>
                
                {confirmRemove === student.id ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmRemove(null)}
                      disabled={removingId === student.id}
                    >
                      취소
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleRemoveChild(student.id)}
                      disabled={removingId === student.id}
                    >
                      {removingId === student.id ? '해제 중...' : '확인'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmRemove(student.id)}
                    className="text-text-muted hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              
              {confirmRemove === student.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-amber-600 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>이 자녀와의 연결을 해제하시겠습니까?</span>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* 자녀 추가 */}
      {isAddingChild ? (
        <Card className="p-4">
          <h3 className="font-semibold text-text mb-3">새 자녀 연결</h3>
          
          {!verifiedStudent ? (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <Input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    placeholder="연결 코드 입력"
                    className="pl-10 uppercase"
                    disabled={isVerifying}
                    maxLength={6}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleVerifyCode();
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={handleVerifyCode}
                  disabled={isVerifying || !newCode}
                >
                  {isVerifying ? '확인 중...' : '확인'}
                </Button>
              </div>
              <p className="text-xs text-text-muted mt-2">
                자녀가 회원가입 시 발급받은 6자리 연결 코드를 입력하세요.
              </p>
            </>
          ) : (
            <>
              <div className="p-3 rounded-xl bg-success/10 text-success text-sm flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4" />
                <span><strong>{verifiedStudent.name}</strong> 학생과 연결됩니다</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCancelAdd}
                  className="flex-1"
                  disabled={isPending}
                >
                  취소
                </Button>
                <Button
                  onClick={handleAddChild}
                  className="flex-1"
                  disabled={isPending}
                >
                  {isPending ? '연결 중...' : '연결하기'}
                </Button>
              </div>
            </>
          )}
          
          {error && (
            <div className="mt-3 p-3 rounded-xl bg-error/10 text-error text-sm text-center">
              {error}
            </div>
          )}
        </Card>
      ) : (
        <Button
          onClick={() => setIsAddingChild(true)}
          variant="outline"
          className="w-full gap-2"
        >
          <UserPlus className="w-4 h-4" />
          자녀 추가
        </Button>
      )}

      {/* 전역 에러 표시 */}
      {error && !isAddingChild && (
        <div className="p-3 rounded-xl bg-error/10 text-error text-sm text-center">
          {error}
        </div>
      )}
    </div>
  );
}
