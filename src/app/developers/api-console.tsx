'use client';

import { useState } from 'react';

// 연동 안내 페이지의 호출 테스트. 같은 도메인의 /api/external/v1/* 를 직접 호출한다.
// 인증키는 이 컴포넌트 상태에만 두고 저장(localStorage·URL)하지 않는다.

const ENDPOINTS = [
  { value: 'students', label: '학생 명단 — /students' },
  { value: 'points', label: '누적 획득 상점 — /points' },
  { value: 'study-time', label: '순공시간 — /study-time' },
] as const;

const GRADES = ['N수생', '고3', '고2', '고1', '중3', '중2', '중1'];

type Result = {
  status: number;
  ms: number;
  headers: Record<string, string>;
  body: string;
};

const INPUT =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-primary focus:outline-none';

export function ApiConsole() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [endpoint, setEndpoint] = useState<(typeof ENDPOINTS)[number]['value']>('study-time');
  const [grades, setGrades] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const params = new URLSearchParams();
  if (grades.length) params.set('grade', grades.join(','));
  if (endpoint === 'study-time') {
    if (from) params.set('from', from);
    if (to) params.set('to', to);
  }
  const query = params.toString();
  const path = `/api/external/v1/${endpoint}${query ? `?${query}` : ''}`;

  const toggleGrade = (g: string) =>
    setGrades((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const send = async () => {
    setLoading(true);
    const started = performance.now();
    try {
      const res = await fetch(path, {
        headers: { 'X-API-Key': apiKey.trim() },
        cache: 'no-store',
      });
      const text = await res.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // JSON 이 아니면 원문 그대로
      }
      const headers: Record<string, string> = {};
      for (const h of [
        'x-ratelimit-limit',
        'x-ratelimit-remaining',
        'x-ratelimit-reset',
        'retry-after',
      ]) {
        const v = res.headers.get(h);
        if (v !== null) headers[h] = v;
      }
      setResult({ status: res.status, ms: Math.round(performance.now() - started), headers, body });
    } catch (e) {
      setResult({
        status: 0,
        ms: Math.round(performance.now() - started),
        headers: {},
        body: `요청을 보내지 못했습니다: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const statusColor =
    result && result.status >= 200 && result.status < 300
      ? 'bg-green-50 text-green-700'
      : 'bg-red-50 text-red-700';

  return (
    <div className='space-y-4 rounded-xl border border-gray-200 bg-white p-5'>
      <div>
        <label className='mb-1 block font-medium'>인증키</label>
        <div className='flex gap-2'>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder='rsk_...'
            autoComplete='off'
            spellCheck={false}
            className={`${INPUT} font-mono`}
          />
          <button
            type='button'
            onClick={() => setShowKey((v) => !v)}
            className='shrink-0 rounded-lg border border-gray-200 px-3 text-xs hover:bg-gray-50'
          >
            {showKey ? '숨기기' : '보기'}
          </button>
        </div>
      </div>

      <div>
        <label className='mb-1 block font-medium'>조회 기능</label>
        <select
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value as typeof endpoint)}
          className={INPUT}
        >
          {ENDPOINTS.map((ep) => (
            <option key={ep.value} value={ep.value}>
              {ep.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className='mb-1 block font-medium'>학년 (선택 안 하면 전체)</span>
        <div className='flex flex-wrap gap-2'>
          {GRADES.map((g) => {
            const on = grades.includes(g);
            return (
              <button
                key={g}
                type='button'
                onClick={() => toggleGrade(g)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-xs ${
                  on ? 'border-primary bg-primary text-white' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {endpoint === 'study-time' && (
        <div className='grid grid-cols-2 gap-3'>
          <div>
            <label className='mb-1 block font-medium'>from (선택)</label>
            <input
              type='date'
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className='mb-1 block font-medium'>to (선택)</label>
            <input
              type='date'
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={INPUT}
            />
          </div>
          <p className='text-text-muted col-span-2 text-xs'>
            비워 두면 이번 주 월요일 ~ 오늘입니다.
          </p>
        </div>
      )}

      <div className='rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs break-all'>
        GET {decodeURIComponent(path)}
      </div>

      <button
        type='button'
        onClick={send}
        disabled={loading || !apiKey.trim()}
        className='bg-primary w-full rounded-lg py-2.5 font-semibold text-white disabled:opacity-50'
      >
        {loading ? '호출 중…' : '호출하기'}
      </button>

      {result && (
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center gap-2 text-xs'>
            <span className={`rounded-full px-2 py-0.5 font-semibold ${statusColor}`}>
              {result.status || '실패'}
            </span>
            <span className='text-text-muted'>{result.ms}ms</span>
            {result.headers['x-ratelimit-remaining'] !== undefined && (
              <span className='text-text-muted'>
                남은 호출 {result.headers['x-ratelimit-remaining']}/
                {result.headers['x-ratelimit-limit']} (초기화까지{' '}
                {result.headers['x-ratelimit-reset']}초)
              </span>
            )}
            {result.headers['retry-after'] && (
              <span className='text-red-600'>{result.headers['retry-after']}초 후 다시 시도</span>
            )}
          </div>
          <pre className='max-h-[480px] overflow-auto rounded-lg bg-gray-900 p-4 font-mono text-[12px] leading-relaxed text-gray-100'>
            {result.body}
          </pre>
        </div>
      )}
    </div>
  );
}
