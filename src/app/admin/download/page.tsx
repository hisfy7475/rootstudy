'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getStudentDataForExport,
  getAttendanceDataForExport,
  getFocusDataForExport,
  getPointsDataForExport,
} from '@/lib/actions/admin';
import {
  Download,
  Users,
  Clock,
  Brain,
  Award,
  FileSpreadsheet,
  Calendar,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type DataType = 'students' | 'attendance' | 'focus' | 'points';

const dataTypes: {
  value: DataType;
  label: string;
  description: string;
  icon: typeof Users;
  needsDateRange: boolean;
}[] = [
  {
    value: 'students',
    label: '학생 데이터',
    description: '전체 학생 목록 및 기본 정보',
    icon: Users,
    needsDateRange: false,
  },
  {
    value: 'attendance',
    label: '학습시간 데이터',
    description: '일별 입실/퇴실 및 학습시간',
    icon: Clock,
    needsDateRange: true,
  },
  {
    value: 'focus',
    label: '몰입도 데이터',
    description: '학생별 몰입도 점수 기록',
    icon: Brain,
    needsDateRange: true,
  },
  {
    value: 'points',
    label: '상벌점 데이터',
    description: '상점/벌점 부여 내역',
    icon: Award,
    needsDateRange: true,
  },
];

export default function DownloadPage() {
  const [selectedType, setSelectedType] = useState<DataType>('students');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(false);

  const selectedDataType = dataTypes.find((d) => d.value === selectedType)!;

  const handleDownload = async () => {
    setLoading(true);

    try {
      let data: Record<string, unknown>[] = [];
      let filename = '';

      switch (selectedType) {
        case 'students':
          data = await getStudentDataForExport();
          filename = `학생목록_${new Date().toISOString().split('T')[0]}`;
          break;
        case 'attendance':
          data = await getAttendanceDataForExport(startDate, endDate + 'T23:59:59');
          filename = `학습시간_${startDate}_${endDate}`;
          break;
        case 'focus':
          data = await getFocusDataForExport(startDate, endDate + 'T23:59:59');
          filename = `몰입도_${startDate}_${endDate}`;
          break;
        case 'points':
          data = await getPointsDataForExport(startDate, endDate + 'T23:59:59');
          filename = `상벌점_${startDate}_${endDate}`;
          break;
      }

      if (data.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
      }

      // xlsx 라이브러리 동적 임포트
      const XLSX = await import('xlsx');

      // 워크북 생성
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      // 열 너비 자동 조절
      const colWidths = Object.keys(data[0]).map((key) => ({
        wch: Math.max(
          key.length * 2,
          ...data.map((row) => String(row[key] || '').length * 1.5)
        ),
      }));
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

      // 파일 다운로드
      XLSX.writeFile(wb, `${filename}.xlsx`);
    } catch (error) {
      console.error('Download failed:', error);
      alert('다운로드에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">데이터 다운로드</h1>
        <p className="text-text-muted mt-1">학습 데이터를 엑셀 파일로 다운로드하세요</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 데이터 유형 선택 */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">데이터 유형 선택</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dataTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedType === type.value;

                return (
                  <button
                    key={type.value}
                    onClick={() => setSelectedType(type.value)}
                    className={cn(
                      'p-4 rounded-2xl border-2 text-left transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-100 hover:border-gray-200'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center',
                          isSelected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-medium">{type.label}</h3>
                        <p className="text-sm text-text-muted mt-1">{type.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* 다운로드 옵션 */}
        <div>
          <Card className="p-6 sticky top-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              다운로드 옵션
            </h2>

            {/* 선택된 데이터 유형 표시 */}
            <div className="p-4 bg-primary/5 rounded-xl mb-4">
              <div className="flex items-center gap-2">
                <selectedDataType.icon className="w-5 h-5 text-primary" />
                <span className="font-medium">{selectedDataType.label}</span>
              </div>
            </div>

            {/* 기간 선택 (필요한 경우) */}
            {selectedDataType.needsDateRange && (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    시작일
                  </label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    종료일
                  </label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* 다운로드 버튼 */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleDownload}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  다운로드 중...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  엑셀 다운로드
                </>
              )}
            </Button>

            {/* 안내 */}
            <p className="text-xs text-text-muted mt-4 text-center">
              .xlsx 형식으로 다운로드됩니다
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
