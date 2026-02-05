'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Plus, Pencil, ToggleLeft, ToggleRight, Users, ChevronUp, ChevronDown } from 'lucide-react';
import { createBranch, updateBranch, activateBranch, deactivateBranch, moveBranchUp, moveBranchDown, type Branch } from '@/lib/actions/branch';

interface BranchWithCount extends Branch {
  studentCount: number;
}

interface BranchesClientProps {
  initialBranches: BranchWithCount[];
}

export default function BranchesClient({ initialBranches }: BranchesClientProps) {
  const [branches, setBranches] = useState(initialBranches);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 새 지점 추가 폼
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');

  // 수정 폼
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;

    setIsLoading(true);
    const result = await createBranch(newName.trim(), newAddress.trim() || undefined);

    if (result.success && result.data) {
      setBranches([...branches, { ...result.data, studentCount: 0 }]);
      setNewName('');
      setNewAddress('');
      setShowAddForm(false);
    }
    setIsLoading(false);
  };

  const handleEdit = (branch: BranchWithCount) => {
    setEditingId(branch.id);
    setEditName(branch.name);
    setEditAddress(branch.address || '');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;

    setIsLoading(true);
    const result = await updateBranch(id, {
      name: editName.trim(),
      address: editAddress.trim() || undefined,
    });

    if (result.success) {
      setBranches(branches.map(b =>
        b.id === id ? { ...b, name: editName.trim(), address: editAddress.trim() || null } : b
      ));
      setEditingId(null);
    }
    setIsLoading(false);
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setIsLoading(true);
    const result = isActive ? await deactivateBranch(id) : await activateBranch(id);

    if (result.success) {
      setBranches(branches.map(b =>
        b.id === id ? { ...b, is_active: !isActive } : b
      ));
    }
    setIsLoading(false);
  };

  const handleMoveUp = async (id: string) => {
    setIsLoading(true);
    const result = await moveBranchUp(id);
    
    if (result.success) {
      // 현재 지점과 위 지점의 순서를 교환
      const currentIndex = branches.findIndex(b => b.id === id);
      if (currentIndex > 0) {
        const newBranches = [...branches];
        const temp = newBranches[currentIndex].display_order;
        newBranches[currentIndex].display_order = newBranches[currentIndex - 1].display_order;
        newBranches[currentIndex - 1].display_order = temp;
        // display_order로 다시 정렬
        newBranches.sort((a, b) => a.display_order - b.display_order);
        setBranches(newBranches);
      }
    }
    setIsLoading(false);
  };

  const handleMoveDown = async (id: string) => {
    setIsLoading(true);
    const result = await moveBranchDown(id);
    
    if (result.success) {
      // 현재 지점과 아래 지점의 순서를 교환
      const currentIndex = branches.findIndex(b => b.id === id);
      if (currentIndex < branches.length - 1) {
        const newBranches = [...branches];
        const temp = newBranches[currentIndex].display_order;
        newBranches[currentIndex].display_order = newBranches[currentIndex + 1].display_order;
        newBranches[currentIndex + 1].display_order = temp;
        // display_order로 다시 정렬
        newBranches.sort((a, b) => a.display_order - b.display_order);
        setBranches(newBranches);
      }
    }
    setIsLoading(false);
  };

  const activeBranches = branches.filter(b => b.is_active).sort((a, b) => a.display_order - b.display_order);
  const inactiveBranches = branches.filter(b => !b.is_active).sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">지점 관리</h1>
          <p className="text-gray-500 mt-1">독서실 지점을 관리합니다.</p>
        </div>
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          지점 추가
        </Button>
      </div>

      {/* 추가 폼 */}
      {showAddForm && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4">새 지점 추가</h3>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">지점명 *</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="예: 강남점"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
              <Input
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="예: 서울시 강남구 ..."
              />
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
                  setNewAddress('');
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
          <div className="text-sm text-gray-500">전체 지점</div>
          <div className="text-2xl font-bold text-gray-800">{branches.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">운영 중</div>
          <div className="text-2xl font-bold text-green-600">{activeBranches.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">비활성</div>
          <div className="text-2xl font-bold text-gray-400">{inactiveBranches.length}</div>
        </Card>
      </div>

      {/* 활성 지점 목록 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">운영 중인 지점</h2>
        <div className="space-y-3">
          {activeBranches.length === 0 ? (
            <Card className="p-6 text-center text-gray-500">
              운영 중인 지점이 없습니다.
            </Card>
          ) : (
            activeBranches.map(branch => (
              <Card key={branch.id} className="p-4">
                {editingId === branch.id ? (
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">지점명</label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                      <Input
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSaveEdit(branch.id)}
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
                      {/* 순서 변경 버튼 */}
                      <div className="flex flex-col gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveUp(branch.id)}
                          disabled={isLoading || activeBranches.indexOf(branch) === 0}
                          className="h-6 w-6 p-0"
                          title="위로 이동"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveDown(branch.id)}
                          disabled={isLoading || activeBranches.indexOf(branch) === activeBranches.length - 1}
                          className="h-6 w-6 p-0"
                          title="아래로 이동"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">{branch.name}</h3>
                        <p className="text-sm text-gray-500">{branch.address || '주소 미등록'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-gray-500">
                        <Users className="w-4 h-4" />
                        <span>{branch.studentCount}명</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(branch)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(branch.id, branch.is_active)}
                          className="text-red-500 hover:text-red-600"
                          title="비활성화"
                        >
                          <ToggleRight className="w-5 h-5" />
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

      {/* 비활성 지점 목록 */}
      {inactiveBranches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-400 mb-3">비활성 지점</h2>
          <div className="space-y-3">
            {inactiveBranches.map(branch => (
              <Card key={branch.id} className="p-4 bg-gray-50 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-500">{branch.name}</h3>
                      <p className="text-sm text-gray-400">{branch.address || '주소 미등록'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Users className="w-4 h-4" />
                      <span>{branch.studentCount}명</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(branch.id, branch.is_active)}
                      className="text-green-500 hover:text-green-600"
                      title="활성화"
                    >
                      <ToggleLeft className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
