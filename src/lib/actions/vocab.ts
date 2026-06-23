'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getStudyDate } from '@/lib/utils';
import { getUserScope } from '@/lib/auth/scope';
import type { VocabPack } from '@/types/database';

// ============================================================
// 영단어 예습·시험 서버 액션.
// PRD: .00_manager/plan/영단어시험_PRD.md
// 시간 계산은 항상 getStudyDate(학습일 KST 06:00 경계) 사용 — 직접 Date 계산 금지.
// 에러 컨벤션(mentoring.ts 준수): 조회 실패→빈배열/null, 쓰기→{ error }/{ success }.
// ============================================================

const EXAM_TOTAL = 40;
const TIME_LIMIT_SEC = 10 * 60;
const OPTIONS_COUNT = 4;
const MIN_ACTIVE_WORDS = 40;
const MIN_UNIQUE_MEANINGS = OPTIONS_COUNT; // 정답 1 + 오답 3

function logError(scope: string, error: unknown): void {
  try {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    console.error(
      scope,
      JSON.stringify({ message: e?.message, code: e?.code, details: e?.details, hint: e?.hint }),
    );
  } catch {
    console.error(scope, String(error));
  }
}

/** getStudyDate 결과(UTC 자정 Date)를 학습일 YYYY-MM-DD 문자열로. */
function studyDateStr(d: Date = new Date()): string {
  return getStudyDate(d).toISOString().slice(0, 10);
}

/** 이번 학습주 월~목 학습일 문자열 4개. */
function mondayToThursdayStrs(now: Date = new Date()): string[] {
  const study = getStudyDate(now); // UTC 자정
  const dow = study.getUTCDay(); // 0=일 .. 6=토
  const backToMon = (dow + 6) % 7;
  const monday = new Date(study);
  monday.setUTCDate(monday.getUTCDate() - backToMon);
  return [0, 1, 2, 3].map((i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function isFriday(now: Date = new Date()): boolean {
  return getStudyDate(now).getUTCDay() === 5;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// 타입
// ============================================================

export type StudentPackView = {
  id: string;
  name: string;
  description: string | null;
  /** 선택 가능(공개+기간내+단어충분) 여부. false면 "준비중" 비활성 노출. */
  selectable: boolean;
  badge: '준비중' | null;
};

export type ExamQuestionView = {
  questionNo: number;
  english: string;
  options: string[];
  selected: string | null;
};

export type ExamResultQuestion = {
  questionNo: number;
  english: string;
  answer: string;
  selected: string | null;
  isCorrect: boolean;
  options: string[];
};

export type ExamResult = {
  examId: string;
  packName: string;
  examType: 'normal' | 'friday_review';
  examDate: string;
  score: number;
  total: number;
  submitType: 'in_progress' | 'normal' | 'auto';
  submittedAt: string | null;
  questions: ExamResultQuestion[];
};

// ============================================================
// 노출 판정
// ============================================================

function isWithinPublishWindow(
  pack: Pick<VocabPack, 'publish_start_at' | 'publish_end_at'>,
  now: Date,
): boolean {
  if (pack.publish_start_at && new Date(pack.publish_start_at) > now) return false;
  if (pack.publish_end_at && new Date(pack.publish_end_at) < now) return false;
  return true;
}

// ============================================================
// 학생 — 꾸러미 / 예습
// ============================================================

export async function getStudentVocabPacks(): Promise<StudentPackView[]> {
  const supabase = await createClient();
  const now = new Date();

  // RLS: 학생은 status in ('public','preparing') 만 읽힘 (hidden/disabled 제외).
  const { data: packs, error } = await supabase
    .from('vocab_packs')
    .select('id, name, description, status, display_order, publish_start_at, publish_end_at')
    .in('status', ['public', 'preparing'])
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    logError('[getStudentVocabPacks]', error);
    return [];
  }
  if (!packs || packs.length === 0) return [];

  // 활성 단어 수 집계 (선택 가능 게이트용).
  const packIds = packs.map((p) => p.id);
  const counts = await getActiveWordCounts(supabase, packIds);

  return packs.map((p) => {
    const within = isWithinPublishWindow(p, now);
    const enoughWords = (counts.get(p.id) ?? 0) >= MIN_ACTIVE_WORDS;
    const selectable = p.status === 'public' && within && enoughWords;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      selectable,
      badge: selectable ? null : ('준비중' as const),
    };
  });
}

async function getActiveWordCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  packIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (packIds.length === 0) return map;
  const { data, error } = await supabase
    .from('vocab_pack_words')
    .select('pack_id, vocab_words!inner(is_active)')
    .in('pack_id', packIds)
    .eq('vocab_words.is_active', true);
  if (error) {
    logError('[getActiveWordCounts]', error);
    return map;
  }
  for (const row of data ?? []) {
    map.set(row.pack_id, (map.get(row.pack_id) ?? 0) + 1);
  }
  return map;
}

export type PreviewWord = {
  english: string;
  koreanPrimary: string;
  koreanExtra: string | null;
  problemGroup: string | null;
};

export async function getPreviewWords(packId: string): Promise<PreviewWord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vocab_pack_words')
    .select('vocab_words!inner(english, korean_primary, korean_extra, problem_group, is_active)')
    .eq('pack_id', packId)
    .eq('vocab_words.is_active', true);
  if (error) {
    logError('[getPreviewWords]', error);
    return [];
  }
  const words = (data ?? [])
    .map(
      (r) =>
        r.vocab_words as unknown as {
          english: string;
          korean_primary: string;
          korean_extra: string | null;
          problem_group: string | null;
        },
    )
    .filter(Boolean);
  words.sort((a, b) => a.english.toLowerCase().localeCompare(b.english.toLowerCase()));
  return words.map((w) => ({
    english: w.english,
    koreanPrimary: w.korean_primary,
    koreanExtra: w.korean_extra,
    problemGroup: w.problem_group,
  }));
}

// ============================================================
// 학생 — 시험 시작 (멱등) + 문항 생성
// ============================================================

type BuiltQuestion = {
  question_no: number;
  word_id: string;
  english_snapshot: string;
  answer_snapshot: string;
  options: string[];
};

type ActiveWord = { id: string; english: string; korean_primary: string };

async function loadActiveWords(
  supabase: Awaited<ReturnType<typeof createClient>>,
  packId: string,
): Promise<ActiveWord[]> {
  const { data, error } = await supabase
    .from('vocab_pack_words')
    .select('vocab_words!inner(id, english, korean_primary, is_active)')
    .eq('pack_id', packId)
    .eq('vocab_words.is_active', true);
  if (error) {
    logError('[loadActiveWords]', error);
    return [];
  }
  return (data ?? [])
    .map((r) => r.vocab_words as unknown as ActiveWord & { is_active: boolean })
    .map((w) => ({ id: w.id, english: w.english, korean_primary: w.korean_primary }));
}

/** 40문항 + 4지선다 보기 생성. 단어/뜻 부족 시 { ok:false }. */
function buildQuestionSet(
  activeWords: ActiveWord[],
  fridayWrongWordIds: string[],
): { ok: true; questions: BuiltQuestion[] } | { ok: false; error: string } {
  if (activeWords.length < MIN_ACTIVE_WORDS) {
    return { ok: false, error: '이 꾸러미는 현재 응시할 수 없습니다. (단어 수 부족)' };
  }
  const uniqueMeanings = new Set(activeWords.map((w) => w.korean_primary));
  if (uniqueMeanings.size < MIN_UNIQUE_MEANINGS) {
    return { ok: false, error: '이 꾸러미는 현재 응시할 수 없습니다. (뜻 종류 부족)' };
  }

  // 출제 단어 선정: 금요일 오답 우선 → 나머지 랜덤 보충 → 40개.
  const byId = new Map(activeWords.map((w) => [w.id, w]));
  const wrong = shuffle(fridayWrongWordIds.filter((id) => byId.has(id)));
  let chosen: ActiveWord[];
  if (wrong.length >= EXAM_TOTAL) {
    chosen = wrong.slice(0, EXAM_TOTAL).map((id) => byId.get(id)!);
  } else {
    const wrongSet = new Set(wrong);
    const rest = shuffle(activeWords.filter((w) => !wrongSet.has(w.id)));
    chosen = [...wrong.map((id) => byId.get(id)!), ...rest].slice(0, EXAM_TOTAL);
  }

  const questions: BuiltQuestion[] = chosen.map((word, idx) => {
    const answer = word.korean_primary;
    const pool = Array.from(
      new Set(activeWords.map((w) => w.korean_primary).filter((m) => m !== answer)),
    );
    const distractors = shuffle(pool).slice(0, OPTIONS_COUNT - 1);
    const options = shuffle([answer, ...distractors]);
    return {
      question_no: idx + 1,
      word_id: word.id,
      english_snapshot: word.english,
      answer_snapshot: answer,
      options,
    };
  });

  return { ok: true, questions };
}

/** 이번 학습주 월~목, 해당 꾸러미 오답/미선택 word_id (현재 활성·연결 단어로 한정). */
async function getFridayWrongWordIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  packId: string,
  activeWordIds: Set<string>,
  now: Date,
): Promise<string[]> {
  const days = mondayToThursdayStrs(now);
  const { data: exams, error: exErr } = await supabase
    .from('vocab_exams')
    .select('id')
    .eq('student_id', studentId)
    .eq('pack_id', packId)
    .in('exam_date', days);
  if (exErr || !exams || exams.length === 0) {
    if (exErr) logError('[getFridayWrongWordIds] exams', exErr);
    return [];
  }
  const examIds = exams.map((e) => e.id);
  const { data: qs, error: qErr } = await supabase
    .from('vocab_exam_questions')
    .select('word_id, is_correct, selected')
    .in('exam_id', examIds);
  if (qErr || !qs) {
    if (qErr) logError('[getFridayWrongWordIds] questions', qErr);
    return [];
  }
  const wrong = new Set<string>();
  for (const q of qs) {
    const isWrong = q.is_correct === false || q.selected === null;
    if (isWrong && q.word_id && activeWordIds.has(q.word_id)) wrong.add(q.word_id);
  }
  return [...wrong];
}

export type StartExamResult =
  | { ok: true; examId: string; resumed: boolean }
  | { ok: false; error: string };

export async function startVocabExam(packId: string): Promise<StartExamResult> {
  const supabase = await createClient();
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'student')
    return { ok: false, error: '학생만 응시할 수 있습니다.' };

  const studentId = scope.userId;
  const now = new Date();
  const examDate = studyDateStr(now);

  // 멱등: 오늘 레코드가 이미 있으면 재사용/차단.
  const { data: existing } = await supabase
    .from('vocab_exams')
    .select('id, submitted_at, started_at')
    .eq('student_id', studentId)
    .eq('exam_date', examDate)
    .maybeSingle();
  if (existing) {
    if (existing.submitted_at) return { ok: false, error: '오늘은 이미 응시를 완료했습니다.' };
    return { ok: true, examId: existing.id, resumed: true };
  }

  // 꾸러미 노출/선택 가능 검증.
  const { data: pack, error: packErr } = await supabase
    .from('vocab_packs')
    .select('id, status, publish_start_at, publish_end_at')
    .eq('id', packId)
    .maybeSingle();
  if (packErr || !pack) return { ok: false, error: '꾸러미를 찾을 수 없습니다.' };
  if (pack.status !== 'public' || !isWithinPublishWindow(pack, now)) {
    return { ok: false, error: '현재 응시할 수 없는 꾸러미입니다.' };
  }

  // 문항 생성 (시작 가드 포함).
  const activeWords = await loadActiveWords(supabase, packId);
  const activeIds = new Set(activeWords.map((w) => w.id));
  const friday = isFriday(now);
  const wrongIds = friday
    ? await getFridayWrongWordIds(supabase, studentId, packId, activeIds, now)
    : [];
  const built = buildQuestionSet(activeWords, wrongIds);
  if (!built.ok) return { ok: false, error: built.error };

  // 시험 헤더 insert (UNIQUE(student_id, exam_date) 가 race 흡수).
  const { data: inserted, error: insErr } = await supabase
    .from('vocab_exams')
    .insert({
      student_id: studentId,
      pack_id: packId,
      exam_type: friday ? 'friday_review' : 'normal',
      exam_date: examDate,
      started_at: now.toISOString(),
      submit_type: 'in_progress',
      total: EXAM_TOTAL,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    // race: 동시 요청이 먼저 만든 경우 → 그 레코드 재사용.
    if ((insErr as { code?: string } | null)?.code === '23505') {
      const { data: dup } = await supabase
        .from('vocab_exams')
        .select('id, submitted_at')
        .eq('student_id', studentId)
        .eq('exam_date', examDate)
        .maybeSingle();
      if (dup) {
        if (dup.submitted_at) return { ok: false, error: '오늘은 이미 응시를 완료했습니다.' };
        return { ok: true, examId: dup.id, resumed: true };
      }
    }
    logError('[startVocabExam] insert exam', insErr);
    return { ok: false, error: '시험을 시작하지 못했습니다.' };
  }

  const examId = inserted.id;
  const rows = built.questions.map((q) => ({
    exam_id: examId,
    question_no: q.question_no,
    word_id: q.word_id,
    english_snapshot: q.english_snapshot,
    answer_snapshot: q.answer_snapshot,
    options: q.options,
    selected: null,
    is_correct: null,
  }));
  const { error: qInsErr } = await supabase.from('vocab_exam_questions').insert(rows);
  if (qInsErr) {
    logError('[startVocabExam] insert questions', qInsErr);
    // 헤더만 남으면 문항 없는 시험이 되므로 롤백.
    await supabase.from('vocab_exams').delete().eq('id', examId);
    return { ok: false, error: '시험을 시작하지 못했습니다.' };
  }

  return { ok: true, examId, resumed: false };
}

// ============================================================
// 학생 — 진행 / 저장 / 제출
// ============================================================

function isExpired(startedAt: string, now: Date = new Date()): boolean {
  return now.getTime() > new Date(startedAt).getTime() + TIME_LIMIT_SEC * 1000;
}

export async function saveVocabAnswer(
  examId: string,
  questionNo: number,
  selected: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'student') return { error: '권한이 없습니다.' };

  const { data: exam } = await supabase
    .from('vocab_exams')
    .select('id, student_id, submitted_at, started_at')
    .eq('id', examId)
    .maybeSingle();
  if (!exam || exam.student_id !== scope.userId) return { error: '시험을 찾을 수 없습니다.' };
  if (exam.submitted_at || isExpired(exam.started_at)) return { error: '시험이 종료되었습니다.' };

  // 정답 비교를 위해 해당 문항 answer 조회 후 is_correct 동시 저장.
  const { data: q } = await supabase
    .from('vocab_exam_questions')
    .select('id, answer_snapshot, options')
    .eq('exam_id', examId)
    .eq('question_no', questionNo)
    .maybeSingle();
  if (!q) return { error: '문항을 찾을 수 없습니다.' };
  const opts = (q.options as string[]) ?? [];
  if (!opts.includes(selected)) return { error: '잘못된 보기입니다.' };

  const { error } = await supabase
    .from('vocab_exam_questions')
    .update({ selected, is_correct: selected === q.answer_snapshot })
    .eq('id', q.id);
  if (error) {
    logError('[saveVocabAnswer]', error);
    return { error: '답안 저장에 실패했습니다.' };
  }
  return { success: true };
}

/**
 * 클라이언트가 보유한 답안을 서버에 반영(미반영분만 갱신).
 * 네트워크 끊김 동안 낙관적 저장(saveVocabAnswer)이 실패한 답을 제출/복원 시점에 복구한다.
 * options 에 없는 값/이미 동일한 값은 건너뛴다. is_correct 도 함께 재계산.
 */
async function applyAnswers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  examId: string,
  answers: Record<number, string>,
): Promise<void> {
  const nos = Object.keys(answers ?? {})
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (nos.length === 0) return;
  const { data: qs, error } = await supabase
    .from('vocab_exam_questions')
    .select('question_no, answer_snapshot, options, selected')
    .eq('exam_id', examId)
    .in('question_no', nos);
  if (error || !qs) {
    if (error) logError('[applyAnswers]', error);
    return;
  }
  for (const q of qs) {
    const sel = answers[q.question_no];
    if (sel === undefined) continue;
    const opts = (q.options as string[]) ?? [];
    if (!opts.includes(sel)) continue; // 유효 보기만
    if (q.selected === sel) continue; // 이미 동일하면 skip
    const { error: uErr } = await supabase
      .from('vocab_exam_questions')
      .update({ selected: sel, is_correct: sel === q.answer_snapshot })
      .eq('exam_id', examId)
      .eq('question_no', q.question_no);
    if (uErr) logError('[applyAnswers] update', uErr);
  }
}

/**
 * 클라이언트 보유 답안을 서버에 동기화(채점/마감은 하지 않음).
 * 진행 화면 복원 직후, 그리고 타이머 만료 자동마감 직전 호출해
 * 네트워크 끊김 복구분이 점수에 누락되지 않도록 한다.
 */
export async function syncVocabAnswers(
  examId: string,
  answers: Record<number, string>,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'student') return { error: '권한이 없습니다.' };

  const { data: exam } = await supabase
    .from('vocab_exams')
    .select('id, student_id, submitted_at')
    .eq('id', examId)
    .maybeSingle();
  if (!exam || exam.student_id !== scope.userId) return { error: '시험을 찾을 수 없습니다.' };
  if (exam.submitted_at) return { success: true }; // 이미 마감됨

  await applyAnswers(supabase, examId, answers);
  return { success: true };
}

/** 채점 확정(제출/자동마감 공통). */
async function finalizeExam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  examId: string,
  submitType: 'normal' | 'auto',
): Promise<number | null> {
  const { count, error: cErr } = await supabase
    .from('vocab_exam_questions')
    .select('id', { count: 'exact', head: true })
    .eq('exam_id', examId)
    .eq('is_correct', true);
  if (cErr) {
    logError('[finalizeExam] count', cErr);
    return null;
  }
  const score = count ?? 0;
  const { error: uErr } = await supabase
    .from('vocab_exams')
    .update({ score, submit_type: submitType, submitted_at: new Date().toISOString() })
    .eq('id', examId)
    .is('submitted_at', null); // 멱등: 이미 제출됐으면 무시
  if (uErr) {
    logError('[finalizeExam] update', uErr);
    return null;
  }
  return score;
}

export async function submitVocabExam(
  examId: string,
  answers?: Record<number, string>,
): Promise<{ success?: true; score?: number; error?: string }> {
  const supabase = await createClient();
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'student') return { error: '권한이 없습니다.' };

  const { data: exam } = await supabase
    .from('vocab_exams')
    .select('id, student_id, submitted_at, score')
    .eq('id', examId)
    .maybeSingle();
  if (!exam || exam.student_id !== scope.userId) return { error: '시험을 찾을 수 없습니다.' };
  if (exam.submitted_at) return { success: true, score: exam.score ?? 0 };

  // 채점 직전 클라이언트 보유 답안 최종 동기화(네트워크 끊김 복구분 포함).
  if (answers) await applyAnswers(supabase, examId, answers);

  const score = await finalizeExam(supabase, examId, 'normal');
  if (score === null) return { error: '제출에 실패했습니다.' };
  revalidatePath('/student/vocab/history');
  return { success: true, score };
}

// ============================================================
// 학생 — 진행 복원 / 결과 조회 (lazy 마감)
// ============================================================

export type ResumeView =
  | {
      status: 'in_progress';
      examId: string;
      packName: string;
      remainingSec: number;
      questions: ExamQuestionView[];
    }
  | { status: 'finished'; examId: string };

export async function getVocabExamForResume(examId: string): Promise<ResumeView | null> {
  const supabase = await createClient();
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'student') return null;

  const { data: exam } = await supabase
    .from('vocab_exams')
    .select('id, student_id, submitted_at, started_at, pack_id, vocab_packs(name)')
    .eq('id', examId)
    .maybeSingle();
  if (!exam || exam.student_id !== scope.userId) return null;

  // 만료+미제출 → lazy 자동마감.
  if (!exam.submitted_at && isExpired(exam.started_at)) {
    await finalizeExam(supabase, examId, 'auto');
    return { status: 'finished', examId };
  }
  if (exam.submitted_at) return { status: 'finished', examId };

  const { data: qs } = await supabase
    .from('vocab_exam_questions')
    .select('question_no, english_snapshot, options, selected')
    .eq('exam_id', examId)
    .order('question_no', { ascending: true });

  const remainingSec = Math.max(
    0,
    TIME_LIMIT_SEC - Math.floor((Date.now() - new Date(exam.started_at).getTime()) / 1000),
  );
  const packName = (exam.vocab_packs as unknown as { name: string } | null)?.name ?? '';
  return {
    status: 'in_progress',
    examId,
    packName,
    remainingSec,
    questions: (qs ?? []).map((q) => ({
      questionNo: q.question_no,
      english: q.english_snapshot,
      options: (q.options as string[]) ?? [],
      selected: q.selected,
    })),
  };
}

export async function getVocabExamResult(examId: string): Promise<ExamResult | null> {
  const supabase = await createClient();
  const scope = await getUserScope();
  if (!scope) return null;

  const { data: exam } = await supabase
    .from('vocab_exams')
    .select(
      'id, student_id, pack_id, exam_type, exam_date, score, total, submit_type, submitted_at, started_at, vocab_packs(name)',
    )
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return null;
  // 학생은 본인만(관리자는 RLS가 지점 스코프로 허용).
  if (scope.userType === 'student' && exam.student_id !== scope.userId) return null;

  // 만료+미제출 → lazy 자동마감 (학생 세션 한정; 관리자는 읽기 전용이라 스킵).
  let submitType = exam.submit_type;
  let score = exam.score;
  let submittedAt = exam.submitted_at;
  if (!exam.submitted_at && scope.userType === 'student' && isExpired(exam.started_at)) {
    const s = await finalizeExam(supabase, examId, 'auto');
    if (s !== null) {
      submitType = 'auto';
      score = s;
      submittedAt = new Date().toISOString();
    }
  }

  const { data: qs } = await supabase
    .from('vocab_exam_questions')
    .select('question_no, english_snapshot, answer_snapshot, options, selected, is_correct')
    .eq('exam_id', examId)
    .order('question_no', { ascending: true });

  return {
    examId,
    packName: (exam.vocab_packs as unknown as { name: string } | null)?.name ?? '',
    examType: exam.exam_type,
    examDate: exam.exam_date,
    score: score ?? 0,
    total: exam.total,
    submitType,
    submittedAt,
    questions: (qs ?? []).map((q) => ({
      questionNo: q.question_no,
      english: q.english_snapshot,
      answer: q.answer_snapshot,
      selected: q.selected,
      isCorrect: q.is_correct === true,
      options: (q.options as string[]) ?? [],
    })),
  };
}

export type HistoryItem = {
  examId: string;
  packName: string;
  examType: 'normal' | 'friday_review';
  examDate: string;
  score: number | null;
  total: number;
  submitType: 'in_progress' | 'normal' | 'auto';
};

export async function getMyVocabHistory(): Promise<HistoryItem[]> {
  const supabase = await createClient();
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'student') return [];

  const { data, error } = await supabase
    .from('vocab_exams')
    .select(
      'id, exam_type, exam_date, score, total, submit_type, submitted_at, started_at, vocab_packs(name)',
    )
    .eq('student_id', scope.userId)
    .order('exam_date', { ascending: false })
    .order('started_at', { ascending: false });
  if (error) {
    logError('[getMyVocabHistory]', error);
    return [];
  }

  // 만료된 미완료분 lazy 마감.
  const items: HistoryItem[] = [];
  for (const e of data ?? []) {
    let submitType = e.submit_type;
    let score = e.score;
    if (!e.submitted_at && isExpired(e.started_at)) {
      const s = await finalizeExam(supabase, e.id, 'auto');
      if (s !== null) {
        submitType = 'auto';
        score = s;
      }
    }
    items.push({
      examId: e.id,
      packName: (e.vocab_packs as unknown as { name: string } | null)?.name ?? '',
      examType: e.exam_type,
      examDate: e.exam_date,
      score,
      total: e.total,
      submitType,
    });
  }
  return items;
}

// ============================================================
// 관리자 — 권한 가드
// ============================================================

async function requireSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'admin')
    return { ok: false, error: '관리자 권한이 필요합니다.' };
  if (!scope.isSuperAdmin)
    return { ok: false, error: '단어/꾸러미 관리는 슈퍼관리자만 가능합니다.' };
  return { ok: true };
}

// ============================================================
// 관리자 — 꾸러미 관리
// ============================================================

export type AdminPackRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: VocabPack['status'];
  displayOrder: number;
  publishStartAt: string | null;
  publishEndAt: string | null;
  totalWords: number;
  activeWords: number;
  hasExamRecords: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function getAdminVocabPacks(): Promise<AdminPackRow[]> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return [];
  const supabase = await createClient();

  const { data: packs, error } = await supabase
    .from('vocab_packs')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    logError('[getAdminVocabPacks]', error);
    return [];
  }
  const packIds = (packs ?? []).map((p) => p.id);

  // 단어 수(전체/활성) + 시험기록 존재 여부 집계.
  const activeCounts = await getActiveWordCounts(supabase, packIds);
  const totalCounts = new Map<string, number>();
  if (packIds.length > 0) {
    const { data: links } = await supabase
      .from('vocab_pack_words')
      .select('pack_id')
      .in('pack_id', packIds);
    for (const l of links ?? []) totalCounts.set(l.pack_id, (totalCounts.get(l.pack_id) ?? 0) + 1);
  }
  const examPacks = new Set<string>();
  if (packIds.length > 0) {
    const { data: exRows } = await supabase
      .from('vocab_exams')
      .select('pack_id')
      .in('pack_id', packIds);
    for (const r of exRows ?? []) examPacks.add(r.pack_id);
  }

  return (packs ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description,
    status: p.status,
    displayOrder: p.display_order,
    publishStartAt: p.publish_start_at,
    publishEndAt: p.publish_end_at,
    totalWords: totalCounts.get(p.id) ?? 0,
    activeWords: activeCounts.get(p.id) ?? 0,
    hasExamRecords: examPacks.has(p.id),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

export type PackInput = {
  name: string;
  code: string;
  description?: string | null;
  displayOrder?: number;
  status?: VocabPack['status'];
  publishStartAt?: string | null;
  publishEndAt?: string | null;
};

export async function createVocabPack(
  input: PackInput,
): Promise<{ success?: true; packId?: string; error?: string }> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();

  if (!input.name?.trim() || !input.code?.trim()) return { error: '이름과 관리코드는 필수입니다.' };

  const { data, error } = await supabase
    .from('vocab_packs')
    .insert({
      name: input.name.trim(),
      code: input.code.trim(),
      description: input.description ?? null,
      display_order: input.displayOrder ?? 0,
      status: input.status ?? 'preparing',
      publish_start_at: input.publishStartAt ?? null,
      publish_end_at: input.publishEndAt ?? null,
    })
    .select('id')
    .single();
  if (error || !data) {
    if ((error as { code?: string } | null)?.code === '23505')
      return { error: '이미 사용 중인 관리코드입니다.' };
    logError('[createVocabPack]', error);
    return { error: '꾸러미 등록에 실패했습니다.' };
  }
  revalidatePath('/admin/vocab/packs');
  return { success: true, packId: data.id };
}

export async function updateVocabPack(
  packId: string,
  input: Partial<PackInput>,
  opts?: { force?: boolean },
): Promise<{ success?: true; error?: string; needsConfirm?: string }> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();

  // 공개 전환 시 활성 단어 40개 미만 경고.
  if (input.status === 'public' && !opts?.force) {
    const counts = await getActiveWordCounts(supabase, [packId]);
    if ((counts.get(packId) ?? 0) < MIN_ACTIVE_WORDS) {
      return {
        needsConfirm: `사용 가능한 단어가 ${MIN_ACTIVE_WORDS}개 미만입니다. 공개하면 학생이 시험을 시작할 수 없습니다. 그래도 공개할까요?`,
      };
    }
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.code !== undefined) patch.code = input.code.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.displayOrder !== undefined) patch.display_order = input.displayOrder;
  if (input.status !== undefined) patch.status = input.status;
  if (input.publishStartAt !== undefined) patch.publish_start_at = input.publishStartAt;
  if (input.publishEndAt !== undefined) patch.publish_end_at = input.publishEndAt;

  const { error } = await supabase.from('vocab_packs').update(patch).eq('id', packId);
  if (error) {
    if ((error as { code?: string } | null)?.code === '23505')
      return { error: '이미 사용 중인 관리코드입니다.' };
    logError('[updateVocabPack]', error);
    return { error: '꾸러미 수정에 실패했습니다.' };
  }
  revalidatePath('/admin/vocab/packs');
  revalidatePath('/student/vocab/preview');
  revalidatePath('/student/vocab/exam');
  return { success: true };
}

/** 시험기록 없으면 완전 삭제, 있으면 사용중지. */
export async function deleteOrDisableVocabPack(
  packId: string,
): Promise<{ success?: true; disabled?: boolean; error?: string }> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();

  const { count } = await supabase
    .from('vocab_exams')
    .select('id', { count: 'exact', head: true })
    .eq('pack_id', packId);
  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from('vocab_packs')
      .update({ status: 'disabled' })
      .eq('id', packId);
    if (error) {
      logError('[deleteOrDisableVocabPack] disable', error);
      return { error: '사용중지 처리에 실패했습니다.' };
    }
    revalidatePath('/admin/vocab/packs');
    return { success: true, disabled: true };
  }
  const { error } = await supabase.from('vocab_packs').delete().eq('id', packId);
  if (error) {
    logError('[deleteOrDisableVocabPack] delete', error);
    return { error: '삭제에 실패했습니다.' };
  }
  revalidatePath('/admin/vocab/packs');
  return { success: true, disabled: false };
}

// ============================================================
// 관리자 — 단어 관리
// ============================================================

export type AdminWordRow = {
  id: string;
  english: string;
  koreanPrimary: string;
  koreanExtra: string | null;
  problemGroup: string | null;
  isActive: boolean;
  packIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type WordFilters = {
  isActive?: boolean;
  packId?: string;
  english?: string;
  korean?: string;
  problemGroup?: string;
};

export async function getAdminVocabWords(filters: WordFilters = {}): Promise<AdminWordRow[]> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return [];
  const supabase = await createClient();

  let q = supabase
    .from('vocab_words')
    .select('*, vocab_pack_words(pack_id)')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (filters.isActive !== undefined) q = q.eq('is_active', filters.isActive);
  if (filters.english) q = q.ilike('english', `%${filters.english}%`);
  if (filters.korean) q = q.ilike('korean_primary', `%${filters.korean}%`);
  if (filters.problemGroup) q = q.ilike('problem_group', `%${filters.problemGroup}%`);

  const { data, error } = await q;
  if (error) {
    logError('[getAdminVocabWords]', error);
    return [];
  }
  let rows = (data ?? []).map((w) => ({
    id: w.id,
    english: w.english,
    koreanPrimary: w.korean_primary,
    koreanExtra: w.korean_extra,
    problemGroup: w.problem_group,
    isActive: w.is_active,
    packIds: ((w.vocab_pack_words as unknown as { pack_id: string }[]) ?? []).map((l) => l.pack_id),
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }));
  if (filters.packId) rows = rows.filter((r) => r.packIds.includes(filters.packId!));
  return rows;
}

export type WordInput = {
  english: string;
  koreanPrimary: string;
  koreanExtra?: string | null;
  problemGroup?: string | null;
  isActive?: boolean;
  packIds?: string[];
};

export async function createVocabWord(
  input: WordInput,
): Promise<{ success?: true; wordId?: string; error?: string }> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();

  if (!input.english?.trim() || !input.koreanPrimary?.trim()) {
    return { error: '영어 단어와 한국어 대표뜻은 필수입니다.' };
  }
  const { data, error } = await supabase
    .from('vocab_words')
    .insert({
      english: input.english.trim(),
      korean_primary: input.koreanPrimary.trim(),
      korean_extra: input.koreanExtra ?? null,
      problem_group: input.problemGroup ?? null,
      is_active: input.isActive ?? true,
    })
    .select('id')
    .single();
  if (error || !data) {
    if ((error as { code?: string } | null)?.code === '23505')
      return { error: '이미 등록된 단어입니다(대소문자 무시).' };
    logError('[createVocabWord]', error);
    return { error: '단어 등록에 실패했습니다.' };
  }
  if (input.packIds?.length) {
    await supabase
      .from('vocab_pack_words')
      .insert(input.packIds.map((pid) => ({ pack_id: pid, word_id: data.id })));
  }
  revalidatePath('/admin/vocab/words');
  return { success: true, wordId: data.id };
}

export async function updateVocabWord(
  wordId: string,
  input: Partial<WordInput>,
): Promise<{ success?: true; error?: string }> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.koreanPrimary !== undefined) patch.korean_primary = input.koreanPrimary.trim();
  if (input.koreanExtra !== undefined) patch.korean_extra = input.koreanExtra;
  if (input.problemGroup !== undefined) patch.problem_group = input.problemGroup;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  // english(철자)는 키이므로 수정하지 않음.

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('vocab_words').update(patch).eq('id', wordId);
    if (error) {
      logError('[updateVocabWord]', error);
      return { error: '단어 수정에 실패했습니다.' };
    }
  }

  // 꾸러미 연결 동기화(전달된 경우).
  if (input.packIds) {
    await supabase.from('vocab_pack_words').delete().eq('word_id', wordId);
    if (input.packIds.length > 0) {
      await supabase
        .from('vocab_pack_words')
        .insert(input.packIds.map((pid) => ({ pack_id: pid, word_id: wordId })));
    }
  }
  revalidatePath('/admin/vocab/words');
  revalidatePath('/student/vocab/preview');
  return { success: true };
}

export async function setVocabWordActive(
  wordId: string,
  isActive: boolean,
): Promise<{ success?: true; error?: string }> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from('vocab_words')
    .update({ is_active: isActive })
    .eq('id', wordId);
  if (error) {
    logError('[setVocabWordActive]', error);
    return { error: '사용 여부 변경에 실패했습니다.' };
  }
  revalidatePath('/admin/vocab/words');
  return { success: true };
}

// ============================================================
// 관리자 — 응시내역 조회 / 엑셀
// ============================================================

export type AdminExamFilters = {
  fromDate?: string;
  toDate?: string;
  branchId?: string;
  studentTypeId?: string;
  studentSearch?: string;
  seatNumber?: number;
  packId?: string;
  examType?: 'normal' | 'friday_review';
  submitStatus?: 'in_progress' | 'normal' | 'auto';
  scoreMin?: number;
  scoreMax?: number;
};

export type AdminExamRow = {
  examId: string;
  studentName: string;
  groupName: string | null;
  seatNumber: number | null;
  branchName: string | null;
  examDate: string;
  startedAt: string;
  submittedAt: string | null;
  packName: string;
  examType: 'normal' | 'friday_review';
  score: number | null;
  total: number;
  /** 표시용 제출상태(만료된 in_progress는 auto로 계산). */
  submitStatus: 'in_progress' | 'normal' | 'auto';
};

type ExamJoinRow = {
  id: string;
  exam_type: 'normal' | 'friday_review';
  exam_date: string;
  started_at: string;
  submitted_at: string | null;
  submit_type: 'in_progress' | 'normal' | 'auto';
  score: number | null;
  total: number;
  vocab_packs: { name: string } | null;
  profiles: {
    name: string;
    branch_id: string | null;
    branches: { name: string } | null;
    student_profiles: {
      seat_number: number | null;
      student_type_id: string | null;
      student_types: { name: string } | null;
    } | null;
  } | null;
};

async function fetchAdminExamRows(filters: AdminExamFilters): Promise<AdminExamRow[]> {
  const guard = await getUserScope();
  if (!guard || guard.userType !== 'admin') return [];
  const supabase = await createClient();

  // RLS가 지점 스코프(슈퍼=전체)를 강제하므로 추가 branch 필터만 옵션 적용.
  let q = supabase
    .from('vocab_exams')
    .select(
      `id, exam_type, exam_date, started_at, submitted_at, submit_type, score, total,
       vocab_packs(name),
       profiles!vocab_exams_student_id_fkey(name, branch_id, branches(name),
         student_profiles(seat_number, student_type_id, student_types(name)))`,
    )
    .order('exam_date', { ascending: false })
    .order('started_at', { ascending: false })
    .limit(5000);

  if (filters.fromDate) q = q.gte('exam_date', filters.fromDate);
  if (filters.toDate) q = q.lte('exam_date', filters.toDate);
  if (filters.packId) q = q.eq('pack_id', filters.packId);
  if (filters.examType) q = q.eq('exam_type', filters.examType);
  if (filters.scoreMin !== undefined) q = q.gte('score', filters.scoreMin);
  if (filters.scoreMax !== undefined) q = q.lte('score', filters.scoreMax);

  const { data, error } = await q;
  if (error) {
    logError('[fetchAdminExamRows]', error);
    return [];
  }

  const now = new Date();
  let rows: AdminExamRow[] = ((data ?? []) as unknown as ExamJoinRow[]).map((e) => {
    const prof = e.profiles;
    const sp = prof?.student_profiles ?? null;
    const computed: AdminExamRow['submitStatus'] =
      !e.submitted_at && isExpired(e.started_at, now) ? 'auto' : e.submit_type;
    return {
      examId: e.id,
      studentName: prof?.name ?? '',
      groupName: sp?.student_types?.name ?? null,
      seatNumber: sp?.seat_number ?? null,
      branchName: prof?.branches?.name ?? null,
      examDate: e.exam_date,
      startedAt: e.started_at,
      submittedAt: e.submitted_at,
      packName: e.vocab_packs?.name ?? '',
      examType: e.exam_type,
      score: e.score,
      total: e.total,
      submitStatus: computed,
    };
  });

  // 조인 컬럼 기반 필터(JS).
  if (filters.branchId) {
    rows = rows.filter((r) => {
      const e = (data as unknown as ExamJoinRow[]).find((x) => x.id === r.examId);
      return e?.profiles?.branch_id === filters.branchId;
    });
  }
  if (filters.studentTypeId) {
    rows = rows.filter((r) => {
      const e = (data as unknown as ExamJoinRow[]).find((x) => x.id === r.examId);
      return e?.profiles?.student_profiles?.student_type_id === filters.studentTypeId;
    });
  }
  if (filters.studentSearch) {
    const s = filters.studentSearch.trim().toLowerCase();
    rows = rows.filter((r) => r.studentName.toLowerCase().includes(s));
  }
  if (filters.seatNumber !== undefined)
    rows = rows.filter((r) => r.seatNumber === filters.seatNumber);
  if (filters.submitStatus) rows = rows.filter((r) => r.submitStatus === filters.submitStatus);

  return rows;
}

export async function getAdminVocabExams(filters: AdminExamFilters = {}): Promise<AdminExamRow[]> {
  return fetchAdminExamRows(filters);
}

/** 응시내역 필터용 꾸러미 옵션(전체 관리자). */
export async function getVocabPackOptions(): Promise<{ id: string; name: string }[]> {
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'admin') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vocab_packs')
    .select('id, name')
    .order('display_order', { ascending: true });
  if (error) {
    logError('[getVocabPackOptions]', error);
    return [];
  }
  return (data ?? []).map((p) => ({ id: p.id, name: p.name }));
}

/** 엑셀 다운로드용 평탄화 행(검색결과 전체). */
export async function getVocabExamsForExport(
  filters: AdminExamFilters = {},
): Promise<Record<string, string | number>[]> {
  const rows = await fetchAdminExamRows(filters);
  const statusLabel = { in_progress: '진행 중', normal: '정상 제출', auto: '자동 제출' } as const;
  const typeLabel = { normal: '일반', friday_review: '금요일 오답' } as const;
  return rows.map((r) => ({
    학생: r.studentName,
    그룹: r.groupName ?? '',
    자리번호: r.seatNumber ?? '',
    센터: r.branchName ?? '',
    시험날짜: r.examDate,
    시작시간: r.startedAt,
    제출일시: r.submittedAt ?? '',
    단어꾸러미: r.packName,
    시험구분: typeLabel[r.examType],
    점수: r.score === null ? '' : `${r.score}/${r.total}`,
    제출방식: statusLabel[r.submitStatus],
  }));
}

// ============================================================
// 관리자 — 엑셀 업로드(단어 일괄 등록)
// ============================================================

export type ImportRow = {
  packCode: string;
  english: string;
  koreanPrimary: string;
  koreanExtra?: string | null;
  problemGroup?: string | null;
  isActive?: boolean;
};

export type ImportResult = {
  inserted: number;
  linked: number;
  updated: number;
  skipped: number;
  errors: { rowIndex: number; reason: string }[];
};

export async function importVocabWords(
  rows: ImportRow[],
  dupPolicy: 'keep' | 'update' | 'skip',
): Promise<{ result?: ImportResult; error?: string }> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();

  const result: ImportResult = { inserted: 0, linked: 0, updated: 0, skipped: 0, errors: [] };

  // 꾸러미 코드 → id
  const codes = [...new Set(rows.map((r) => (r.packCode ?? '').trim()).filter(Boolean))];
  const { data: packs } = await supabase.from('vocab_packs').select('id, code').in('code', codes);
  const codeToId = new Map((packs ?? []).map((p) => [p.code, p.id]));

  // 기존 단어 lower(english) → id (대량 사전조회)
  const englishes = [
    ...new Set(rows.map((r) => (r.english ?? '').trim().toLowerCase()).filter(Boolean)),
  ];
  const existing = new Map<string, string>();
  if (englishes.length > 0) {
    const { data: ws } = await supabase.from('vocab_words').select('id, english');
    for (const w of ws ?? []) existing.set(w.english.toLowerCase(), w.id);
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const english = (r.english ?? '').trim();
    const korean = (r.koreanPrimary ?? '').trim();
    const code = (r.packCode ?? '').trim();

    if (!english || !korean) {
      result.errors.push({ rowIndex: i, reason: '영어 단어 또는 한국어 뜻이 비어 있음' });
      continue;
    }
    const packId = codeToId.get(code);
    if (!packId) {
      result.errors.push({ rowIndex: i, reason: `존재하지 않는 꾸러미 코드: ${code}` });
      continue;
    }

    const key = english.toLowerCase();
    let wordId = existing.get(key);

    if (!wordId) {
      const { data: ins, error: insErr } = await supabase
        .from('vocab_words')
        .insert({
          english,
          korean_primary: korean,
          korean_extra: r.koreanExtra ?? null,
          problem_group: r.problemGroup ?? null,
          is_active: r.isActive ?? true,
        })
        .select('id')
        .single();
      if (insErr || !ins) {
        result.errors.push({ rowIndex: i, reason: '단어 등록 실패' });
        continue;
      }
      const createdId: string = ins.id;
      wordId = createdId;
      existing.set(key, createdId);
      result.inserted++;
    } else {
      if (dupPolicy === 'skip') {
        result.skipped++;
        continue;
      }
      if (dupPolicy === 'update') {
        await supabase
          .from('vocab_words')
          .update({
            korean_primary: korean,
            korean_extra: r.koreanExtra ?? null,
            problem_group: r.problemGroup ?? null,
            is_active: r.isActive ?? true,
          })
          .eq('id', wordId);
        result.updated++;
      }
      // 'keep' 은 단어 필드 불변, 연결만 추가(아래).
    }

    // 꾸러미 연결(중복은 무시).
    if (!wordId) continue;
    const { error: linkErr } = await supabase
      .from('vocab_pack_words')
      .upsert(
        { pack_id: packId, word_id: wordId },
        { onConflict: 'pack_id,word_id', ignoreDuplicates: true },
      );
    if (!linkErr) result.linked++;
  }

  revalidatePath('/admin/vocab/words');
  revalidatePath('/admin/vocab/packs');
  return { result };
}
