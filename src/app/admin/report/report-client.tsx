'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn, formatDateKST, getWeekDateStringsFromMondayKST } from '@/lib/utils';
import {
  getImmersionReportData,
  getWeeklyStudyTrend,
  saveCounselingReport,
} from '@/lib/actions/report';
import type {
  ImmersionReportData,
  WeeklyTrendPoint,
} from '@/lib/actions/report';
import { ImmersionReportView } from '@/components/report/immersion-report-view';

export interface ReportStudentRow {
  id: string;
  name: string;
  studentTypeName: string | null;
  seatNumber: number | null;
}

export interface AdminReportClientProps {
  students: ReportStudentRow[];
  initialWeekStart: string;
}

function shiftWeekMonday(mondayStr: string, deltaWeeks: number): string {
  const base = new Date(mondayStr + 'T12:00:00+09:00');
  return formatDateKST(addDays(base, deltaWeeks * 7));
}

function formatWeekRangeLabel(weekStartMonday: string): string {
  const days = getWeekDateStringsFromMondayKST(weekStartMonday);
  const [a, , , , , , b] = days;
  const fmt = (iso: string) => {
    const d = new Date(iso + 'T12:00:00+09:00');
    return d.toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
    });
  };
  return `${fmt(a)}(월) ~ ${fmt(b)}(일)`;
}

export function AdminReportClient({
  students,
  initialWeekStart,
}: AdminReportClientProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [activeId, setActiveId] = useState<string | null>(
    students[0]?.id ?? null
  );
  const [bulkIds, setBulkIds] = useState<Set<string>>(() => new Set());
  const [typeFilter, setTypeFilter] = useState<string>('전체');
  const [search, setSearch] = useState('');
  const [report, setReport] = useState<ImmersionReportData | null>(null);
  const [trend, setTrend] = useState<WeeklyTrendPoint[]>([]);
  const [bulkForPrint, setBulkForPrint] = useState<
    { report: ImmersionReportData; trend: WeeklyTrendPoint[] }[] | null
  >(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const typeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const s of students) {
      if (s.studentTypeName) names.add(s.studentTypeName);
    }
    return ['전체', ...Array.from(names).sort()];
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (typeFilter !== '전체' && s.studentTypeName !== typeFilter) {
        return false;
      }
      if (!q) return true;
      const seat = s.seatNumber != null ? String(s.seatNumber) : '';
      return (
        s.name.toLowerCase().includes(q) ||
        seat.includes(q)
      );
    });
  }, [students, typeFilter, search]);

  const loadReport = useCallback(
    (studentId: string, monday: string) => {
      startTransition(async () => {
        const [r, t] = await Promise.all([
          getImmersionReportData(studentId, monday),
          getWeeklyStudyTrend(studentId, 8),
        ]);
        setReport(r);
        setTrend(t);
      });
    },
    []
  );

  useEffect(() => {
    if (!activeId) {
      setReport(null);
      setTrend([]);
      return;
    }
    loadReport(activeId, weekStart);
  }, [activeId, weekStart, loadReport]);

  useEffect(() => {
    if (!saveHint) return;
    const t = setTimeout(() => setSaveHint(null), 3500);
    return () => clearTimeout(t);
  }, [saveHint]);

  useEffect(() => {
    const onAfter = () => setBulkForPrint(null);
    window.addEventListener('afterprint', onAfter);
    return () => window.removeEventListener('afterprint', onAfter);
  }, []);

  const toggleBulk = (id: string) => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    const ids = filteredStudents.map((s) => s.id);
    const allOn = ids.length > 0 && ids.every((id) => bulkIds.has(id));
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleSaveCounseling = async (data: {
    studyFeedback: string;
    guidanceNotes: string;
    adminNotes: string;
    parentSummary: string;
  }) => {
    if (!activeId || !report) return;
    const res = await saveCounselingReport({
      studentId: activeId,
      weekStart,
      focusAvg: report.counseling.focusAvg,
      studyFeedback: data.studyFeedback,
      guidanceNotes: data.guidanceNotes,
      adminNotes: data.adminNotes,
      parentSummary: data.parentSummary,
    });
    if (res.success) {
      setSaveHint('저장되었습니다.');
      startTransition(async () => {
        const r = await getImmersionReportData(activeId, weekStart);
        if (r) setReport(r);
      });
    } else {
      setSaveHint(res.error ?? '저장에 실패했습니다.');
    }
  };

  const handleBulkPrint = async () => {
    const ids = Array.from(bulkIds);
    if (!ids.length) {
      window.alert('일괄 출력할 학생을 선택해 주세요.');
      return;
    }
    setBulkLoading(true);
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const [r, t] = await Promise.all([
            getImmersionReportData(id, weekStart),
            getWeeklyStudyTrend(id, 8),
          ]);
          return r ? { report: r, trend: t } : null;
        })
      );
      const ok = results.filter(
        (x): x is { report: ImmersionReportData; trend: WeeklyTrendPoint[] } =>
          x != null
      );
      if (!ok.length) {
        window.alert('리포트를 불러오지 못했습니다.');
        return;
      }
      setBulkForPrint(ok);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.print());
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const weekRangeLabel = formatWeekRangeLabel(weekStart);
  const activeStudent = students.find((s) => s.id === activeId);

  if (!students.length) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card className="p-6 rounded-3xl shadow-sm">
          <p className="text-sm text-text-muted">
            표시할 학생이 없습니다. 지점·회원 설정을 확인해 주세요.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 p-4 md:p-6 max-w-6xl mx-auto">
        <aside className="no-print w-full md:w-72 shrink-0 space-y-3">
          <h1 className="text-xl font-bold text-text md:hidden">몰입도 리포트</h1>
          <Card className="rounded-3xl shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text">학생 선택</h2>
            <div>
              <label className="text-xs text-text-muted">학년</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <Input
              placeholder="이름·좌석 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="py-2.5"
              aria-label="학생 검색"
            />
            <div className="flex items-center justify-between text-xs text-text-muted">
              <button
                type="button"
                onClick={toggleAllFiltered}
                className="text-primary font-medium hover:underline"
              >
                목록 전체 {filteredStudents.length > 0 &&
                filteredStudents.every((s) => bulkIds.has(s.id))
                  ? '해제'
                  : '선택'}
              </button>
              <span>선택 {bulkIds.size}명</span>
            </div>
            <ul className="max-h-[min(420px,50vh)] overflow-y-auto space-y-1 pr-1">
              {filteredStudents.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <li key={s.id}>
                    <div
                      className={cn(
                        'flex items-center gap-2 rounded-2xl border px-2 py-2 transition-colors',
                        isActive
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent hover:bg-gray-50'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={bulkIds.has(s.id)}
                        onChange={() => toggleBulk(s.id)}
                        className="rounded border-gray-300 text-primary focus:ring-primary/30"
                        aria-label={`${s.name} 일괄 선택`}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        type="button"
                        onClick={() => setActiveId(s.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-sm font-medium text-text truncate">
                          {s.name}
                        </p>
                        <p className="text-[11px] text-text-muted truncate">
                          {s.studentTypeName ?? '학년 미지정'}
                          {s.seatNumber != null ? ` · 좌석 ${s.seatNumber}` : ''}
                        </p>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </aside>

        <div
          className={cn(
            'flex-1 min-w-0 space-y-4',
            bulkForPrint && bulkForPrint.length > 0 && 'admin-bulk-print-suppress'
          )}
        >
          <div className="hidden md:block">
            <h1 className="text-xl font-bold text-text">몰입도 리포트</h1>
            {activeStudent && (
              <p className="text-sm text-text-muted mt-1">
                {activeStudent.name}
                {activeStudent.studentTypeName
                  ? ` · ${activeStudent.studentTypeName}`
                  : ''}
              </p>
            )}
          </div>

          <Card className="no-print rounded-3xl shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl shrink-0 p-2.5 min-w-0 aspect-square"
                  onClick={() => setWeekStart((w) => shiftWeekMonday(w, -1))}
                  aria-label="이전 주"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <div className="text-center min-w-[10rem]">
                  <p className="text-xs text-text-muted">주간</p>
                  <p className="text-sm font-semibold text-text">
                    {weekRangeLabel}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl shrink-0 p-2.5 min-w-0 aspect-square"
                  onClick={() => setWeekStart((w) => shiftWeekMonday(w, 1))}
                  aria-label="다음 주"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl gap-2"
                  onClick={() => window.print()}
                  disabled={!report}
                >
                  <Printer className="w-4 h-4" />
                  개별 출력
                </Button>
                <Button
                  type="button"
                  className="rounded-xl gap-2"
                  onClick={() => void handleBulkPrint()}
                  disabled={bulkLoading || bulkIds.size === 0}
                >
                  {bulkLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  일괄 출력
                </Button>
              </div>
            </div>
            {saveHint && (
              <p className="mt-3 text-xs text-primary">{saveHint}</p>
            )}
          </Card>

          <div className="relative">
            {isPending && (
              <div className="no-print absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-background/60">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {!report && !isPending && activeId && (
              <Card className="rounded-3xl p-6 text-sm text-text-muted">
                리포트를 불러올 수 없습니다.
              </Card>
            )}
            {report && (
              <ImmersionReportView
                report={report}
                weeklyTrend={trend}
                editable
                onSaveCounseling={handleSaveCounseling}
              />
            )}
          </div>
        </div>
      </div>

      {bulkForPrint && bulkForPrint.length > 0 && (
        <div className="hidden print:block">
          {bulkForPrint.map((item, idx) => (
            <div
              key={item.report.studentId}
              className={cn(idx > 0 && 'print-page-break')}
            >
              <div className="max-w-lg mx-auto print:max-w-none px-4 pt-4 print:pt-2">
                <div className="mb-4 text-center border-b border-gray-100 pb-3 print:mb-3">
                  <p className="text-lg font-bold text-text">
                    {item.report.studentName}
                  </p>
                  <p className="text-sm text-text-muted">
                    {item.report.studentTypeName ?? '—'} · {weekRangeLabel}
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    인쇄 일시 (KST){' '}
                    {new Date().toLocaleString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </p>
                </div>
                <ImmersionReportView
                  report={item.report}
                  weeklyTrend={item.trend}
                  editable={false}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
