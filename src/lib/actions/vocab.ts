'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getStudyDate } from '@/lib/utils';
import { getUserScope } from '@/lib/auth/scope';
import { parseProblemGroups } from '@/lib/vocab-problem-group';
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
const VOCAB_REWARD_AMOUNT = 2; // 시험 정상 완료 시 자동 부여 상점

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

/**
 * 학습일(YYYY-MM-DD) → 그 주 월요일 학습일(YYYY-MM-DD). 주 시작=월요일(DAY_CONFIG.weekStartsOn).
 * 입력은 이미 학습일(KST 06:00 경계) 문자열이므로 getStudyDate 재변환이 불필요하다
 * (exam_date·studyDateStr 산출물이 이미 학습일). UTC 자정으로 파싱해 요일만 계산한다.
 */
function weekMondayStr(studyDateStr: string): string {
  const d = new Date(`${studyDateStr}T00:00:00.000Z`);
  const backToMon = (d.getUTCDay() + 6) % 7; // 월요일까지 거슬러 갈 일수 (일=6)
  d.setUTCDate(d.getUTCDate() - backToMon);
  return d.toISOString().slice(0, 10);
}

/** 이번 학습주 월~목 학습일 문자열 4개. */
function mondayToThursdayStrs(now: Date = new Date()): string[] {
  const monday = new Date(`${weekMondayStr(studyDateStr(now))}T00:00:00.000Z`);
  return [0, 1, 2, 3].map((i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** 학습일(YYYY-MM-DD)이 속한 학습주의 월~금 학습일 문자열 5개(상점 개근 판정용). */
function mondayToFridayStrs(studyDateStr: string): string[] {
  const monday = new Date(`${weekMondayStr(studyDateStr)}T00:00:00.000Z`);
  return [0, 1, 2, 3, 4].map((i) => {
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
  // 꾸러미별 head count. 단일 select 집계는 PostgREST 기본 1000행 상한에 걸려
  // 2000+ 단어 꾸러미의 개수가 잘리므로(→ 부당 '준비중'), count: 'exact' 로 정확 집계한다.
  for (const packId of packIds) {
    const { count, error } = await supabase
      .from('vocab_pack_words')
      .select('word_id, vocab_words!inner(is_active)', { count: 'exact', head: true })
      .eq('pack_id', packId)
      .eq('vocab_words.is_active', true);
    if (error) {
      logError('[getActiveWordCounts]', error);
      continue;
    }
    map.set(packId, count ?? 0);
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

  // 노출 게이트: 미공개(공개 예정/기간 외) 꾸러미 단어가 직접 호출로 새지 않도록 서버에서 차단.
  // (RLS 는 preparing 까지 읽기 허용하므로 여기서 공개 상태/기간을 추가 검증한다.)
  const { data: pack } = await supabase
    .from('vocab_packs')
    .select('status, publish_start_at, publish_end_at')
    .eq('id', packId)
    .maybeSingle();
  if (!pack || pack.status !== 'public' || !isWithinPublishWindow(pack, new Date())) {
    return [];
  }

  // PostgREST 기본 1000행 상한 → range 페이지네이션으로 전량 조회(2000+ 꾸러미 예습 전체 노출).
  type PreviewRow = {
    english: string;
    korean_primary: string;
    korean_extra: string | null;
    problem_group: string | null;
  };
  const words: PreviewRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('vocab_pack_words')
      .select('vocab_words!inner(english, korean_primary, korean_extra, problem_group, is_active)')
      .eq('pack_id', packId)
      .eq('vocab_words.is_active', true)
      .order('word_id', { ascending: true })
      .range(from, from + 999);
    if (error) {
      logError('[getPreviewWords]', error);
      break;
    }
    const rows = (data ?? []).map((r) => r.vocab_words as unknown as PreviewRow).filter(Boolean);
    for (const w of rows) words.push(w);
    if ((data?.length ?? 0) < 1000) break;
  }
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

type ActiveWord = {
  id: string;
  english: string;
  korean_primary: string;
  problem_group: string | null;
};

async function loadActiveWords(
  supabase: Awaited<ReturnType<typeof createClient>>,
  packId: string,
): Promise<ActiveWord[]> {
  // PostgREST 기본 1000행 상한 → range 페이지네이션으로 전량 조회(2000+ 풀에서 랜덤 출제 보장).
  // order 고정으로 페이지 간 누락/중복 방지.
  const out: ActiveWord[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('vocab_pack_words')
      .select('vocab_words!inner(id, english, korean_primary, problem_group, is_active)')
      .eq('pack_id', packId)
      .eq('vocab_words.is_active', true)
      .order('word_id', { ascending: true })
      .range(from, from + 999);
    if (error) {
      logError('[loadActiveWords]', error);
      break;
    }
    const rows = (data ?? []).map(
      (r) => r.vocab_words as unknown as ActiveWord & { is_active: boolean },
    );
    for (const w of rows)
      out.push({
        id: w.id,
        english: w.english,
        korean_primary: w.korean_primary,
        problem_group: w.problem_group,
      });
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

/**
 * 문항 + 4지선다 보기 생성. 단어/뜻 부족 시 { ok:false }.
 * - 평일: 그 주(월~목) 아직 출제되지 않은 단어 우선 40개 → 4일에 걸쳐 160개 중복 없이 커버.
 *   미출제분이 40개 미만이면(꾸러미 활성 단어 < 160 또는 주 후반) 이미 출제분으로 40개를 채운다.
 * - 금요일 + 그 주 오답 있음: 오답 단어 **전체** 출제(40 상한·랜덤 보충 없음, 문항 수=오답 수).
 * - 금요일 + 오답 0: 평일과 동일 분기(servedWordIds 가 비어 사실상 랜덤 40 fallback).
 * 보기(distractor): 정답 단어와 problem_group 이 하나라도 겹치는(교집합) 단어의 뜻을 1순위로,
 *   부족분(< OPTIONS_COUNT-1)은 활성 단어 전체 뜻에서 보충한다. 단일 Set 누적으로
 *   정답 제외·뜻 중복 제거·정확히 OPTIONS_COUNT-1개 확보를 한 불변식으로 보장한다
 *   (그룹 NULL/소규모·금요일 가변 문항 모두 전체 보충으로 안전).
 */
function buildQuestionSet(
  activeWords: ActiveWord[],
  fridayWrongWordIds: string[],
  opts: { friday: boolean; servedWordIds?: Set<string> },
): { ok: true; questions: BuiltQuestion[] } | { ok: false; error: string } {
  if (activeWords.length < MIN_ACTIVE_WORDS) {
    return { ok: false, error: '이 꾸러미는 현재 응시할 수 없습니다. (단어 수 부족)' };
  }
  const uniqueMeanings = new Set(activeWords.map((w) => w.korean_primary));
  if (uniqueMeanings.size < MIN_UNIQUE_MEANINGS) {
    return { ok: false, error: '이 꾸러미는 현재 응시할 수 없습니다. (뜻 종류 부족)' };
  }
  // 전체 보충용 유니크 뜻(가드로 ≥ MIN_UNIQUE_MEANINGS 보장).
  const allMeanings = [...uniqueMeanings];

  // 그룹 번호 → 그 그룹 단어들의 뜻 집합(1회 선계산). 멀티값 단어는 자신의 모든 그룹에 등장.
  const groupMeanings = new Map<number, Set<string>>();
  for (const w of activeWords) {
    for (const g of parseProblemGroups(w.problem_group)) {
      let set = groupMeanings.get(g);
      if (!set) groupMeanings.set(g, (set = new Set<string>()));
      set.add(w.korean_primary);
    }
  }

  const byId = new Map(activeWords.map((w) => [w.id, w]));
  const wrong = shuffle(fridayWrongWordIds.filter((id) => byId.has(id)));
  let chosen: ActiveWord[];
  if (opts.friday && wrong.length > 0) {
    // 금요일 누적 오답: 그 주 오답 전체를 출제(상한·보충 없음).
    chosen = wrong.map((id) => byId.get(id)!);
  } else {
    // 평일(또는 금요일 오답 0개): 그 주 미출제 단어를 우선 채우고, 부족분은 이미 출제분으로 보충.
    // unseen ∪ servedWords = activeWords(≥40)이므로 항상 정확히 EXAM_TOTAL개 확보.
    const served = opts.servedWordIds ?? new Set<string>();
    const unseen = activeWords.filter((w) => !served.has(w.id));
    const servedWords = activeWords.filter((w) => served.has(w.id));
    chosen = [...shuffle(unseen), ...shuffle(servedWords)].slice(0, EXAM_TOTAL);
  }

  const NEED = OPTIONS_COUNT - 1; // 오답 보기 개수(=3)
  const questions: BuiltQuestion[] = chosen.map((word, idx) => {
    const answer = word.korean_primary;
    // 단일 Set 누적: 정답 제외 + 뜻 중복 제거 + 정확히 NEED 개 확보를 한 불변식으로 보장.
    const picked = new Set<string>();
    const tryAdd = (candidates: string[]): void => {
      for (const m of shuffle(candidates)) {
        if (m === answer || picked.has(m)) continue;
        picked.add(m);
        if (picked.size === NEED) return;
      }
    };
    // 1순위: 정답 단어와 그룹이 겹치는(교집합) 단어 뜻.
    const groupPool: string[] = [];
    for (const g of parseProblemGroups(word.problem_group)) {
      const set = groupMeanings.get(g);
      if (set) for (const m of set) groupPool.push(m);
    }
    tryAdd(groupPool);
    // 2순위(부족분): 활성 단어 전체 뜻에서 보충.
    if (picked.size < NEED) tryAdd(allMeanings);

    const options = shuffle([answer, ...picked]);
    return {
      question_no: idx + 1,
      word_id: word.id,
      english_snapshot: word.english,
      answer_snapshot: answer,
      options,
    };
  });

  // 방어 단언: 보기 4개·중복 없음·정답 포함(가드+누적 불변식으로 항상 참이어야 함).
  const broken = questions.find(
    (q) => new Set(q.options).size !== OPTIONS_COUNT || !q.options.includes(q.answer_snapshot),
  );
  if (broken) {
    logError('[buildQuestionSet] invalid options', { question_no: broken.question_no });
    return { ok: false, error: '문항 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' };
  }

  return { ok: true, questions };
}

type WeeklyWrongRow = { word_id: string | null; english: string; answer: string };

/**
 * 이번 학습주 월~목, 제출 완료된 시험의 오답/미선택 문항(스냅샷).
 * 마감 필터(`submitted_at is not null`)로 미제출 in_progress 시험(전 문항 selected=null)이
 * 통째로 "오답"으로 오염되는 것을 차단한다. packId 지정 시 해당 꾸러미로 한정(시험용),
 * 미지정 시 전 꾸러미(복습용).
 */
async function getWeeklyWrongQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  now: Date,
  opts: { packId?: string } = {},
): Promise<WeeklyWrongRow[]> {
  const days = mondayToThursdayStrs(now);
  let exq = supabase
    .from('vocab_exams')
    .select('id')
    .eq('student_id', studentId)
    .in('exam_date', days)
    .not('submitted_at', 'is', null); // 제출 완료분만(미제출 in_progress 오염 차단)
  if (opts.packId) exq = exq.eq('pack_id', opts.packId);
  const { data: exams, error: exErr } = await exq;
  if (exErr || !exams || exams.length === 0) {
    if (exErr) logError('[getWeeklyWrongQuestions] exams', exErr);
    return [];
  }
  const examIds = exams.map((e) => e.id);
  const { data: qs, error: qErr } = await supabase
    .from('vocab_exam_questions')
    .select('word_id, is_correct, selected, english_snapshot, answer_snapshot')
    .in('exam_id', examIds);
  if (qErr || !qs) {
    if (qErr) logError('[getWeeklyWrongQuestions] questions', qErr);
    return [];
  }
  const rows: WeeklyWrongRow[] = [];
  for (const q of qs) {
    const isWrong = q.is_correct === false || q.selected === null;
    if (isWrong) {
      rows.push({ word_id: q.word_id, english: q.english_snapshot, answer: q.answer_snapshot });
    }
  }
  return rows;
}

/**
 * 이번 학습주 월~목, 해당 꾸러미에서 이미 "출제된" word_id 집합(평일 중복 출제 방지용).
 * - getWeeklyWrongQuestions 와 달리 `.not('submitted_at','is',null)` 마감 필터를 **적용하지 않는다**(의도적).
 *   문항은 시험 시작 시 즉시 insert 되므로, 제출하지 않고 중단한 이전 요일 시험의 단어도 "출제됨"으로 간주해야
 *   다음날 재출제되지 않는다. 마감 필터를 걸면 중단분이 미출제로 되살아나 중복 금지가 깨진다.
 * - startVocabExam 의 멱등 가드가 오늘 레코드를 먼저 차단하므로, 이 쿼리는 항상 "이전 요일"만 매칭한다.
 * - JS Set 이 자동 dedup 하므로 DB DISTINCT 불필요.
 */
async function getWeeklyServedWordIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  packId: string,
  now: Date,
): Promise<Set<string>> {
  const days = mondayToThursdayStrs(now);
  const { data: exams, error: exErr } = await supabase
    .from('vocab_exams')
    .select('id')
    .eq('student_id', studentId)
    .eq('pack_id', packId)
    .in('exam_date', days);
  if (exErr || !exams || exams.length === 0) {
    if (exErr) logError('[getWeeklyServedWordIds] exams', exErr);
    return new Set();
  }
  const { data: qs, error: qErr } = await supabase
    .from('vocab_exam_questions')
    .select('word_id')
    .in(
      'exam_id',
      exams.map((e) => e.id),
    );
  if (qErr || !qs) {
    if (qErr) logError('[getWeeklyServedWordIds] questions', qErr);
    return new Set();
  }
  const served = new Set<string>();
  for (const q of qs) if (q.word_id) served.add(q.word_id);
  return served;
}

/** 이번 학습주 월~목, 해당 꾸러미 오답/미선택 word_id (현재 활성·연결 단어로 한정 — 금요일 시험 출제용). */
async function getFridayWrongWordIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  packId: string,
  activeWordIds: Set<string>,
  now: Date,
): Promise<string[]> {
  const rows = await getWeeklyWrongQuestions(supabase, studentId, now, { packId });
  const wrong = new Set<string>();
  for (const r of rows) {
    if (r.word_id && activeWordIds.has(r.word_id)) wrong.add(r.word_id);
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
  // 평일: 그 주 이미 출제된 단어를 제외해 월~목 160개를 중복 없이 출제. 금요일은 미사용(빈 Set).
  const servedIds = friday
    ? new Set<string>()
    : await getWeeklyServedWordIds(supabase, studentId, packId, now);
  const built = buildQuestionSet(activeWords, wrongIds, { friday, servedWordIds: servedIds });
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
      total: built.questions.length, // 금요일 누적 오답은 가변 문항 수
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

/**
 * 영단어 시험 상점 2점 자동 부여 — 그 학습주 **월~금 5일을 모두 정상 제출(개근)** 했을 때 주 1회.
 * - 클라이언트 정책: 매일(월~금) 정상 응시해야 그 주 2점. 하루라도 빠지면(미응시·자동마감) 0점.
 * - 호출 시점에 그 주 월~금 중 submit_type='normal' 인 서로 다른 학습일 수를 세고,
 *   5일 미만이면 부여를 보류한다(개근 완성된 날의 제출에서만 실제 부여).
 * - points 쓰기 RLS 는 admin 전용이라 service-role(createAdminClient)로 INSERT.
 * - 멱등: uq_points_vocab_daily(student_id, study_date) WHERE event_kind='auto_vocab' 가
 *   재시도/동시 마감/개근 후 추가 응시(주말 등) 중복을 23505 로 차단 → 무음 흡수.
 *   study_date 에는 "그 주 월요일 학습일"을 박제해 학습주당 1건만 남는다.
 * - 부여(및 집계) 실패가 채점 확정을 막지 않도록 예외는 로깅만 한다.
 */
async function awardVocabReward(studentId: string, examDate: string): Promise<void> {
  try {
    const admin = createAdminClient();
    // 그 주 월~금 중 '정상 제출'한 서로 다른 학습일 수 집계(개근 판정). 현재 시험은 이미 normal 로 확정된 상태.
    const weekdays = mondayToFridayStrs(examDate);
    const { data: rows, error: cErr } = await admin
      .from('vocab_exams')
      .select('exam_date')
      .eq('student_id', studentId)
      .eq('submit_type', 'normal')
      .in('exam_date', weekdays);
    if (cErr) {
      logError('[awardVocabReward] attendance', cErr);
      return;
    }
    const attended = new Set((rows ?? []).map((r) => r.exam_date));
    if (attended.size < weekdays.length) return; // 월~금 개근 미완성 → 부여 보류

    const { error } = await admin.from('points').insert({
      student_id: studentId,
      admin_id: null,
      type: 'reward',
      amount: VOCAB_REWARD_AMOUNT,
      reason: '영단어 시험 주간 개근(월~금)',
      is_auto: true,
      event_kind: 'auto_vocab',
      study_date: weekMondayStr(examDate), // 주 1회 멱등: 그 주 월요일 학습일로 박제
      preset_id: null,
      preset_type: null,
    });
    if (error && (error as { code?: string }).code !== '23505') {
      logError('[awardVocabReward]', error);
    }
  } catch (e) {
    logError('[awardVocabReward] exception', e);
  }
}

/** 채점 확정(제출/자동마감 공통). normal 제출이면서 이 호출이 실제 마감자일 때만 상점 부여. */
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
  // .select 로 실제 마감자(race 승자) 식별 — 이미 제출됐으면 0행(null) 반환.
  const { data: updated, error: uErr } = await supabase
    .from('vocab_exams')
    .update({ score, submit_type: submitType, submitted_at: new Date().toISOString() })
    .eq('id', examId)
    .is('submitted_at', null) // 멱등: 이미 제출됐으면 무시
    .select('student_id, exam_date')
    .maybeSingle();
  if (uErr) {
    logError('[finalizeExam] update', uErr);
    return null;
  }
  // 정상 제출이고 이 호출이 마감을 수행했을 때만 1회 부여(auto/lazy/cron 마감은 제외).
  if (updated && submitType === 'normal') {
    await awardVocabReward(updated.student_id, updated.exam_date);
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
// 학생 — 복습하기 (이번 주 누적 오답 학습 목록)
// ============================================================

export type ReviewWord = { english: string; answer: string };

/**
 * 이번 학습주(월~목) 제출 완료 시험의 오답/미선택 단어를 전 꾸러미 통합으로 모아
 * lower(english) 기준 dedup 해 영어/뜻 목록으로 반환(금요일 누적 오답 시험 전 복습용).
 * 시험이 아니라 학습 목록이므로 활성 여부와 무관하게 스냅샷 기준으로 보여준다.
 */
export async function getWeeklyWrongWords(): Promise<ReviewWord[]> {
  const supabase = await createClient();
  const scope = await getUserScope();
  if (!scope || scope.userType !== 'student') return [];

  const rows = await getWeeklyWrongQuestions(supabase, scope.userId, new Date());
  const seen = new Set<string>();
  const out: ReviewWord[] = [];
  for (const r of rows) {
    const key = r.english.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ english: r.english, answer: r.answer });
  }
  out.sort((a, b) => a.english.toLowerCase().localeCompare(b.english.toLowerCase()));
  return out;
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
  // 등록단어 수(활성+비활성). 단일 select 집계는 PostgREST 기본 1000행 상한에 걸려
  // 2000+ 꾸러미 수가 잘리므로(→ 935/0 등 오표기), 꾸러미별 count: 'exact' 로 정확 집계한다.
  const totalCounts = new Map<string, number>();
  for (const packId of packIds) {
    const { count, error: cErr } = await supabase
      .from('vocab_pack_words')
      .select('word_id', { count: 'exact', head: true })
      .eq('pack_id', packId);
    if (cErr) {
      logError('[getAdminVocabPacks] totalCounts', cErr);
      continue;
    }
    totalCounts.set(packId, count ?? 0);
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
  const CHUNK = 500;

  // 꾸러미 코드 → id
  const codes = [...new Set(rows.map((r) => (r.packCode ?? '').trim()).filter(Boolean))];
  const { data: packs } = await supabase.from('vocab_packs').select('id, code').in('code', codes);
  const codeToId = new Map((packs ?? []).map((p) => [p.code, p.id]));

  // 기존 단어 lower(english) → id 전량 사전조회.
  // ⚠️ Supabase select 기본 상한 1000행 → 페이지네이션 필수. 미적용 시 1000행 초과 단어가
  //   "신규"로 오인되어 재업로드 때 unique(lower(english)) 위반으로 배치가 실패함.
  const existing = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data: ws, error: wErr } = await supabase
      .from('vocab_words')
      .select('id, english')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (wErr) {
      logError('[importVocabWords] preload', wErr);
      return { error: '기존 단어 조회에 실패했습니다.' };
    }
    for (const w of ws ?? []) existing.set(w.english.toLowerCase(), w.id);
    if (!ws || ws.length < 1000) break;
  }

  // 행 분류: 신규 insert / 기존 update / 꾸러미 연결.
  type WordFields = {
    korean_primary: string;
    korean_extra: string | null;
    problem_group: string | null;
    is_active: boolean;
  };
  const newByKey = new Map<string, WordFields & { english: string }>();
  const updateByKey = new Map<string, WordFields>();
  const links: { packId: string; key: string }[] = [];

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
    const fields: WordFields = {
      korean_primary: korean,
      korean_extra: r.koreanExtra ?? null,
      problem_group: r.problemGroup ?? null,
      is_active: r.isActive ?? true,
    };

    if (existing.has(key)) {
      if (dupPolicy === 'skip') {
        result.skipped++;
        continue; // 기존 동작 보존: skip은 연결도 하지 않음.
      }
      if (dupPolicy === 'update') updateByKey.set(key, fields); // 같은 단어 여러 행이면 마지막 우선.
      links.push({ packId, key }); // keep/update 모두 연결은 추가.
    } else {
      if (!newByKey.has(key)) newByKey.set(key, { english, ...fields }); // 파일 내 중복은 첫 행만 insert.
      links.push({ packId, key });
    }
  }

  // 신규 단어 일괄 insert(청크) → id 매핑(반환 순서 비보장이라 english 키로 매핑).
  const newRows = [...newByKey.values()];
  for (let i = 0; i < newRows.length; i += CHUNK) {
    const { data: ins, error: insErr } = await supabase
      .from('vocab_words')
      .insert(newRows.slice(i, i + CHUNK))
      .select('id, english');
    if (insErr || !ins) {
      logError('[importVocabWords] insert', insErr);
      return { error: '단어 일괄 등록에 실패했습니다.' };
    }
    for (const w of ins) existing.set(w.english.toLowerCase(), w.id);
    result.inserted += ins.length;
  }

  // 기존 단어 수정(update 정책) — 행마다 값이 달라 개별 처리(재업로드에서만 타는 경로).
  for (const [key, fields] of updateByKey) {
    const id = existing.get(key);
    if (!id) continue;
    const { error: upErr } = await supabase.from('vocab_words').update(fields).eq('id', id);
    if (!upErr) result.updated++;
  }

  // 꾸러미 연결 일괄 upsert(청크, (pack,word) 중복 제거).
  const seen = new Set<string>();
  const linkRows: { pack_id: string; word_id: string }[] = [];
  for (const l of links) {
    const wordId = existing.get(l.key);
    if (!wordId) continue;
    const dedup = `${l.packId}:${wordId}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    linkRows.push({ pack_id: l.packId, word_id: wordId });
  }
  for (let i = 0; i < linkRows.length; i += CHUNK) {
    const batch = linkRows.slice(i, i + CHUNK);
    const { error: linkErr } = await supabase
      .from('vocab_pack_words')
      .upsert(batch, { onConflict: 'pack_id,word_id', ignoreDuplicates: true });
    if (linkErr) {
      logError('[importVocabWords] link', linkErr);
      return { error: '꾸러미 연결에 실패했습니다.' };
    }
    result.linked += batch.length;
  }

  revalidatePath('/admin/vocab/words');
  revalidatePath('/admin/vocab/packs');
  return { result };
}
