'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { CounselingReportData } from '@/lib/actions/report';

export interface CounselingReportCardProps {
  counseling: CounselingReportData;
  studentName: string;
  studentTypeName: string | null;
  editable?: boolean;
  onSave?: (data: {
    studyFeedback: string;
    guidanceNotes: string;
    adminNotes: string;
    parentSummary: string;
  }) => void;
  /** 관리자: 템플릿 재적용. 인자는 입력 중인 관리자 메모(폼 상태 유지) */
  onReapplyTemplate?: (currentAdminNotes: string) => void | Promise<void>;
}

export function CounselingReportCard({
  counseling,
  studentName,
  studentTypeName,
  editable = false,
  onSave,
  onReapplyTemplate,
}: CounselingReportCardProps) {
  const [studyFeedback, setStudyFeedback] = useState(counseling.studyFeedback);
  const [guidanceNotes, setGuidanceNotes] = useState(counseling.guidanceNotes);
  const [adminNotes, setAdminNotes] = useState(counseling.adminNotes ?? '');
  const [parentSummary, setParentSummary] = useState(counseling.parentSummary);

  useEffect(() => {
    setStudyFeedback(counseling.studyFeedback);
    setGuidanceNotes(counseling.guidanceNotes);
    setAdminNotes(counseling.adminNotes ?? '');
    setParentSummary(counseling.parentSummary);
  }, [
    counseling.studyFeedback,
    counseling.guidanceNotes,
    counseling.adminNotes,
    counseling.parentSummary,
    counseling.studyFeedbackFull,
    counseling.scoreLabel,
    counseling.focusAvg,
  ]);

  const focusLabel =
    counseling.focusAvg !== null
      ? `평균 ${counseling.focusAvg}점`
      : '미측정';

  const stageLabel = counseling.scoreLabel?.trim();
  const fullForPrint =
    counseling.studyFeedbackFull?.trim() || counseling.studyFeedback;

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-lg font-semibold text-text">상담 리포트</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-text">
          <p>
            <span className="text-text-muted">학생명:</span>{' '}
            <span className="font-medium">{studentName}</span>
            <span className="mx-2 text-text-muted">·</span>
            <span className="text-text-muted">학년:</span>{' '}
            <span className="font-medium">{studentTypeName ?? '—'}</span>
          </p>
          <p className="mt-2">
            <span className="text-text-muted">몰입도 평가:</span>{' '}
            <span className="font-medium">{focusLabel}</span>
            {stageLabel ? (
              <span className="text-text-muted">
                {' '}
                ({stageLabel})
              </span>
            ) : null}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-text-muted">학습 태도</p>
          {editable ? (
            <textarea
              value={studyFeedback}
              onChange={(e) => setStudyFeedback(e.target.value)}
              rows={3}
              className="print:hidden w-full resize-y rounded-2xl border border-gray-200 bg-card px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-primary/30"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-text print:hidden">
              {studyFeedback}
            </p>
          )}
          <p className="hidden whitespace-pre-wrap text-sm text-text print:block">
            {fullForPrint}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-text-muted">향후 지도 계획</p>
          {editable ? (
            <textarea
              value={guidanceNotes}
              onChange={(e) => setGuidanceNotes(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-2xl border border-gray-200 bg-card px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-primary/30"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-text">{guidanceNotes}</p>
          )}
        </div>

        {editable ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-text-muted">관리자 추가 메모</p>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-2xl border border-gray-200 bg-card px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        ) : (
          counseling.adminNotes && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-text-muted">관리자 추가 메모</p>
              <p className="whitespace-pre-wrap text-sm text-text">{counseling.adminNotes}</p>
            </div>
          )
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold text-text-muted">학부모 상담 요약</p>
          <div className="rounded-2xl bg-primary/10 px-4 py-3">
            {editable ? (
              <textarea
                value={parentSummary}
                onChange={(e) => setParentSummary(e.target.value)}
                rows={4}
                className="w-full resize-y rounded-xl border border-primary/20 bg-card/80 px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-primary/30"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-text">{parentSummary}</p>
            )}
          </div>
        </div>

        {editable && onReapplyTemplate && (
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => void onReapplyTemplate(adminNotes)}
          >
            템플릿 다시 적용
          </Button>
        )}

        {editable && onSave && (
          <Button
            type="button"
            className="w-full"
            onClick={() =>
              onSave({
                studyFeedback,
                guidanceNotes,
                adminNotes,
                parentSummary,
              })
            }
          >
            저장
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
