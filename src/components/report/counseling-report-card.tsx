'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { CounselingReportData, MentoringRecordItem } from '@/lib/actions/report';

export interface CounselingReportCardSavePayload {
  studyFeedback: string;
  guidanceNotes: string;
  mentoringLetter: string;
  adminNotes: string;
  parentSummary: string;
}

const MENTORING_TYPE_LABEL: Record<string, string> = {
  mentoring: '멘토링',
  clinic: '클리닉',
  consult: '상담',
};

export interface CounselingReportCardProps {
  counseling: CounselingReportData;
  studentName: string;
  studentTypeName: string | null;
  editable?: boolean;
  /** 해당 주차 멘토링/상담 결과 기록(읽기 전용). */
  mentoringRecords?: MentoringRecordItem[];
  onSave?: (data: CounselingReportCardSavePayload) => void;
  /** 관리자: 템플릿 재적용. 인자는 입력 중인 관리자 메모(폼 상태 유지) */
  onReapplyTemplate?: (currentAdminNotes: string) => void | Promise<void>;
}

export function CounselingReportCard({
  counseling,
  studentName,
  studentTypeName,
  editable = false,
  mentoringRecords = [],
  onSave,
  onReapplyTemplate,
}: CounselingReportCardProps) {
  const [studyFeedback, setStudyFeedback] = useState(counseling.studyFeedback);
  const [guidanceNotes, setGuidanceNotes] = useState(counseling.guidanceNotes);
  const [mentoringLetter, setMentoringLetter] = useState(counseling.mentoringLetter);
  const [adminNotes, setAdminNotes] = useState(counseling.adminNotes ?? '');
  const [parentSummary, setParentSummary] = useState(counseling.parentSummary);

  // 부모로부터 새 counseling prop 이 내려오면(학생/주차 변경, 템플릿 재적용 등)
  // 폼 state 를 다시 동기화한다. React 19 권장 패턴: useEffect 대신 render 중에
  // 이전 prop snapshot 과 비교 후 setState 호출.
  const counselingSig = [
    counseling.studyFeedback,
    counseling.guidanceNotes,
    counseling.mentoringLetter,
    counseling.adminNotes ?? '',
    counseling.parentSummary,
  ].join('\x00');
  const [prevCounselingSig, setPrevCounselingSig] = useState(counselingSig);
  if (counselingSig !== prevCounselingSig) {
    setPrevCounselingSig(counselingSig);
    setStudyFeedback(counseling.studyFeedback);
    setGuidanceNotes(counseling.guidanceNotes);
    setMentoringLetter(counseling.mentoringLetter);
    setAdminNotes(counseling.adminNotes ?? '');
    setParentSummary(counseling.parentSummary);
  }

  const focusLabel = counseling.focusAvg !== null ? `평균 ${counseling.focusAvg}점` : '미측정';

  const stageLabel = counseling.scoreLabel?.trim();
  const showGuidanceNotes = editable || counseling.guidanceNotes.trim() !== '';
  const showMentoringLetter = editable || counseling.mentoringLetter.trim() !== '';
  const adminNotesText = counseling.adminNotes ?? '';
  const showAdminNotes = editable || adminNotesText.trim() !== '';

  return (
    <Card>
      <CardHeader className='pb-2'>
        <h3 className='text-text text-lg font-semibold'>상담 리포트</h3>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='text-text rounded-2xl bg-gray-50 px-4 py-3 text-sm'>
          <p>
            <span className='text-text-muted'>학생명:</span>{' '}
            <span className='font-medium'>{studentName}</span>
            <span className='text-text-muted mx-2'>·</span>
            <span className='text-text-muted'>학년:</span>{' '}
            <span className='font-medium'>{studentTypeName ?? '—'}</span>
          </p>
          <p className='mt-2'>
            <span className='text-text-muted'>몰입도 평가:</span>{' '}
            <span className='font-medium'>{focusLabel}</span>
            {stageLabel ? <span className='text-text-muted'> ({stageLabel})</span> : null}
          </p>
        </div>

        <div>
          <p className='text-text-muted mb-1.5 text-xs font-semibold'>학습 태도</p>
          {editable ? (
            <textarea
              value={studyFeedback}
              onChange={(e) => setStudyFeedback(e.target.value)}
              rows={3}
              className='bg-card text-text focus:ring-primary/30 w-full resize-y rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2'
            />
          ) : (
            <p className='text-text text-sm whitespace-pre-wrap'>{studyFeedback}</p>
          )}
        </div>

        {mentoringRecords.length > 0 && (
          <div>
            <p className='text-text-muted mb-1.5 text-xs font-semibold'>멘토링/상담 기록</p>
            <div className='space-y-2'>
              {mentoringRecords.map((rec, i) => (
                <div key={i} className='rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3'>
                  <p className='text-text-muted mb-1 text-xs'>
                    {rec.date}
                    <span className='mx-1.5'>·</span>
                    {MENTORING_TYPE_LABEL[rec.type] ?? rec.type}
                    {rec.mentorName ? (
                      <>
                        <span className='mx-1.5'>·</span>
                        {rec.mentorName}
                      </>
                    ) : null}
                  </p>
                  <p className='text-text text-sm whitespace-pre-wrap'>{rec.resultNote}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {showGuidanceNotes && (
          <div>
            <p className='text-text-muted mb-1.5 text-xs font-semibold'>상담/멘토링 레터</p>
            {editable ? (
              <textarea
                value={guidanceNotes}
                onChange={(e) => setGuidanceNotes(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder='이번 주 상담·멘토링 코멘트를 입력하세요.'
                className='bg-card text-text focus:ring-primary/30 w-full resize-y rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2'
              />
            ) : (
              <p className='text-text text-sm whitespace-pre-wrap'>{guidanceNotes}</p>
            )}
          </div>
        )}

        {showMentoringLetter && (
          <div>
            <p className='text-text-muted mb-1.5 text-xs font-semibold'>추가 메모/첨언</p>
            {editable ? (
              <textarea
                value={mentoringLetter}
                onChange={(e) => setMentoringLetter(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder='상담/멘토링 레터에 덧붙일 추가 메모를 입력하세요.'
                className='bg-card text-text focus:ring-primary/30 w-full resize-y rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2'
              />
            ) : (
              <p className='text-text text-sm whitespace-pre-wrap'>{mentoringLetter}</p>
            )}
          </div>
        )}

        {showAdminNotes && (
          <div>
            <p className='text-text-muted mb-1.5 text-xs font-semibold'>관리자 추가 메모</p>
            {editable ? (
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={2}
                className='bg-card text-text focus:ring-primary/30 w-full resize-y rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2'
              />
            ) : (
              <p className='text-text text-sm whitespace-pre-wrap'>{adminNotesText}</p>
            )}
          </div>
        )}

        <div>
          <p className='text-text-muted mb-1.5 text-xs font-semibold'>학부모 상담 요약</p>
          <div className='bg-primary/10 rounded-2xl px-4 py-3'>
            {editable ? (
              <textarea
                value={parentSummary}
                onChange={(e) => setParentSummary(e.target.value)}
                rows={4}
                className='border-primary/20 bg-card/80 text-text focus:ring-primary/30 w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2'
              />
            ) : (
              <p className='text-text text-sm whitespace-pre-wrap'>{parentSummary}</p>
            )}
          </div>
        </div>

        {editable && (onReapplyTemplate || onSave) && (
          <div className='flex flex-col gap-2 sm:flex-row'>
            {onReapplyTemplate && (
              <Button
                type='button'
                variant='outline'
                className='w-full rounded-xl sm:flex-1'
                onClick={() => void onReapplyTemplate(adminNotes)}
              >
                템플릿 다시 적용
              </Button>
            )}

            {onSave && (
              <Button
                type='button'
                className='w-full sm:flex-1'
                onClick={() =>
                  onSave({
                    studyFeedback,
                    guidanceNotes,
                    mentoringLetter,
                    adminNotes,
                    parentSummary,
                  })
                }
              >
                저장
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
