#!/usr/bin/env node
/**
 * 클라이언트 원본 단어 꾸러미(xlsx/csv) 일괄 업로드 스크립트.
 *
 * 관리자 화면(/admin/vocab/words)의 엑셀 업로드와 **동일한 규칙**으로 동작한다
 * (src/lib/actions/vocab.ts 의 importVocabWords). 파일이 여러 개라 한 번에 순서를
 * 통제해야 할 때 쓴다. 화면 업로드로 대체 가능하며, 그때는 아래 ORDER 순서대로
 * 중복정책 '갱신'으로 올리면 결과가 같다.
 *
 * 규칙 요약
 * - vocab_words 는 lower(english) 유일 → 같은 단어는 뜻 1개만 존재한다.
 *   여러 꾸러미에 겹치는 단어는 **나중에 올린 파일의 뜻이 이긴다**.
 *   그래서 ORDER 를 TOEFL → GRE → KICE 로 둔다(수능 뜻이 최종 승자).
 * - 꾸러미 연결(vocab_pack_words)은 뜻과 무관하게 모두 추가된다.
 * - 재실행해도 안전(멱등): 신규 0, 변경 0, 연결 upsert.
 *
 * 사용법
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/import-vocab-packs.mjs [--status=preparing|public] [--hide-legacy] [--dry-run]
 *
 *   .env.local 이 있으면 거기서 자동으로 읽는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = path.join(ROOT, '.00_buildersgate/client');

// 업로드 순서 = 뜻 우선순위(뒤가 이김). 수능 뜻을 최종으로 남긴다.
const ORDER = [
  { file: 'TOEFL_영단어_꾸러미.csv' },
  { file: 'GRE_영단어_꾸러미.csv' },
  { file: 'KICE_영단어_꾸러미.csv' },
];

// 새 꾸러미로 대체되어 학생 목록에서 감출 기존 꾸러미(--hide-legacy 일 때만).
// 삭제가 아니라 status='hidden' 이라 데이터·과거 응시기록은 그대로 남고 되돌리기 쉽다.
// 진행 중인 시험은 이어하기 경로에서 status 를 다시 보지 않으므로 중간에 감춰도 안전하다.
const LEGACY_HIDE = ['LEVEL1', 'LEVEL2', 'LEVEL3', '평가원 빈출', 'GRE word', 'GRE plus'];

// LEVEL 값 → 꾸러미 메타. code 는 파일의 LEVEL 값을 그대로 쓴다.
const PACKS = [
  { code: 'KICE1', name: '수능평가원 빈출/예상 단어 1', order: 201 },
  { code: 'KICE2', name: '수능평가원 빈출/예상 단어 2', order: 202 },
  { code: 'KICE3', name: '수능평가원 빈출/예상 단어 3', order: 203 },
  { code: 'GRE1', name: 'GRE 영단어 1', order: 204 },
  { code: 'GRE2', name: 'GRE 영단어 2', order: 205 },
  { code: 'TOEFL', name: 'TOEFL 영단어', order: 206 },
];

// ---------- env ----------
function loadEnv() {
  const f = path.join(ROOT, '.env.local');
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const i = line.indexOf('=');
      if (i < 1 || line.trim().startsWith('#')) continue;
      const k = line.slice(0, i).trim();
      if (process.env[k]) continue;
      process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
    }
  }
}
loadEnv();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const HIDE_LEGACY = args.includes('--hide-legacy');
const STATUS = (args.find((a) => a.startsWith('--status=')) ?? '--status=preparing').split('=')[1];
if (!['preparing', 'public', 'hidden', 'disabled'].includes(STATUS)) {
  console.error(`알 수 없는 status: ${STATUS}`);
  process.exit(1);
}

// ---------- REST ----------
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function req(method, pathname, body, extraHeaders = {}) {
  const r = await fetch(`${URL_}/rest/v1/${pathname}`, {
    method,
    headers: { ...H, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${pathname} → ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
/** select 기본 상한 1000행 → 페이지네이션 필수. */
async function selectAll(table, select, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await req(
      'GET',
      `${table}?select=${select}&order=${order}&limit=1000&offset=${from}`,
    );
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// ---------- CSV ----------
/** 따옴표(""이스케이프 포함)를 지키는 최소 CSV 파서. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift().map((h) => h.replace(/^﻿/, '').trim());
  return rows
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// ---------- 실행 ----------
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const log = (...a) => console.log(...a);

log(`대상: ${URL_}`);
log(`꾸러미 status: ${STATUS}${DRY ? '  (DRY RUN — 쓰기 없음)' : ''}\n`);

// 1) 꾸러미 보장
const existingPacks = await req('GET', 'vocab_packs?select=id,code,name,status,display_order');
const byCode = new Map(existingPacks.map((p) => [p.code, p]));
for (const p of PACKS) {
  const cur = byCode.get(p.code);
  if (cur) {
    log(`  꾸러미 유지: ${p.code} — ${cur.name} (status=${cur.status})`);
    continue;
  }
  log(`  꾸러미 생성: ${p.code} — ${p.name}`);
  if (!DRY) {
    const [created] = await req('POST', 'vocab_packs', [
      { code: p.code, name: p.name, status: STATUS, display_order: p.order },
    ], { Prefer: 'return=representation' });
    byCode.set(p.code, created);
  }
}
if (DRY && PACKS.some((p) => !byCode.has(p.code))) {
  log('\nDRY RUN: 꾸러미가 아직 없어 단어 단계는 건너뜁니다.');
  process.exit(0);
}

// 2) 기존 단어 전량 선조회
let words = await selectAll('vocab_words', 'id,english,korean_primary,korean_extra,problem_group,is_active', 'id.asc');
const existing = new Map(words.map((w) => [w.english.toLowerCase(), w]));
log(`\n기존 단어 ${words.length.toLocaleString()}개 로드`);

const totals = { inserted: 0, updated: 0, unchanged: 0, linked: 0 };

// 2-a) 파일 전체를 먼저 읽어 "단어 → 최종 뜻"을 확정한다.
//      ORDER 뒤쪽 파일이 이기므로, 겹치는 단어는 마지막 파일(KICE)의 뜻이 남는다.
//      선확정해야 같은 단어를 파일마다 덮어쓰지 않아 재실행이 완전한 no-op 이 된다.
const winner = new Map(); // key(lower english) → { english, fields, from }
const links = [];         // { packId, key }
for (const { file } of ORDER) {
  const rows = parseCsv(fs.readFileSync(path.join(CLIENT_DIR, file), 'utf8'));
  for (const r of rows) {
    const english = r['문제'], korean = r['정답'], code = r['LEVEL'];
    if (!english || !korean) throw new Error(`${file}: 빈 단어/뜻 — ${JSON.stringify(r)}`);
    const pack = byCode.get(code);
    if (!pack) throw new Error(`${file}: 존재하지 않는 꾸러미 코드 ${code}`);
    const key = english.toLowerCase();
    winner.set(key, {
      english,
      from: code,
      fields: {
        korean_primary: korean,
        problem_group: r['문제그룹'] || null,
        is_active: true,
      },
    });
    links.push({ packId: pack.id, key });
  }
  log(`  읽음: ${file.padEnd(28)} ${String(rows.length).padStart(5)}행`);
}
log(`  → 고유 단어 ${winner.size.toLocaleString()}개 / 꾸러미 연결 ${links.length.toLocaleString()}건`);

// 2-b) 신규 insert
const toInsert = [];
const toUpdate = [];
for (const [key, w] of winner) {
  const cur = existing.get(key);
  if (!cur) { toInsert.push({ english: w.english, korean_extra: null, ...w.fields }); continue; }
  const same =
    cur.korean_primary === w.fields.korean_primary &&
    (cur.problem_group ?? null) === w.fields.problem_group &&
    cur.is_active === w.fields.is_active;
  if (same) totals.unchanged++;
  else toUpdate.push({ id: cur.id, cur, fields: w.fields });
}
for (const batch of chunk(toInsert, 500)) {
  if (DRY) { totals.inserted += batch.length; continue; }
  const ins = await req('POST', 'vocab_words', batch, { Prefer: 'return=representation' });
  for (const w of ins) existing.set(w.english.toLowerCase(), w);
  totals.inserted += ins.length;
}
// 2-c) 뜻/품사 갱신 (실제로 달라진 행만)
for (const u of toUpdate) {
  if (!DRY) {
    await req('PATCH', `vocab_words?id=eq.${u.id}`, u.fields);
    Object.assign(u.cur, u.fields);
  }
  totals.updated++;
}
// 2-d) 꾸러미 연결
const seen = new Set();
const linkRows = [];
for (const l of links) {
  const w = existing.get(l.key);
  if (!w) continue;
  const k = `${l.packId}:${w.id}`;
  if (seen.has(k)) continue;
  seen.add(k);
  linkRows.push({ pack_id: l.packId, word_id: w.id });
}
for (const batch of chunk(linkRows, 500)) {
  if (!DRY) {
    await req('POST', 'vocab_pack_words?on_conflict=pack_id,word_id', batch, {
      Prefer: 'resolution=ignore-duplicates',
    });
  }
  totals.linked += batch.length;
}

log(`\n합계: 신규 ${totals.inserted} · 뜻갱신 ${totals.updated} · 변화없음 ${totals.unchanged} · 연결 ${totals.linked}`);

// 3) 대체된 기존 꾸러미 숨김
if (HIDE_LEGACY) {
  log('');
  const all = await req('GET', 'vocab_packs?select=id,code,name,status');
  for (const code of LEGACY_HIDE) {
    const p = all.find((x) => x.code === code);
    if (!p) { log(`  숨김 대상 없음: ${code}`); continue; }
    if (p.status === 'hidden') { log(`  이미 숨김: ${code}`); continue; }
    if (!DRY) await req('PATCH', `vocab_packs?id=eq.${p.id}`, { status: 'hidden' });
    log(`  숨김 처리: ${code} (${p.status} → hidden)`);
  }
}

// 4) 검증
if (!DRY) {
  const packs = await req('GET', 'vocab_packs?select=id,code,name,status&order=display_order');
  const linksAll = await selectAll('vocab_pack_words', 'pack_id,word_id', 'pack_id.asc');
  const cnt = new Map();
  for (const l of linksAll) cnt.set(l.pack_id, (cnt.get(l.pack_id) ?? 0) + 1);
  log('\n[검증] 꾸러미별 단어 수');
  for (const p of packs) {
    const mark = PACKS.some((x) => x.code === p.code) ? '★' : ' ';
    log(`  ${mark} ${p.code.padEnd(14)} ${String(cnt.get(p.id) ?? 0).padStart(5)}개  ${p.status.padEnd(10)} ${p.name}`);
  }
}
