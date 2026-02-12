import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { parse, addMinutes, subMinutes } from 'date-fns';
import { DAY_CONFIG, ABSENCE_BUFFER_MINUTES } from "./constants";
import type { StudentAbsenceSchedule } from '@/types/database';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 시간을 HH:MM:SS 형식으로 포맷
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return [hours, minutes, secs]
    .map(v => v.toString().padStart(2, '0'))
    .join(':');
}

/**
 * 날짜를 YYYY-MM-DD 형식으로 포맷
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * 학부모 연결 코드 생성 (6자리 영숫자)
 */
export function generateParentCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 실제 날짜/시간을 학습일로 변환 (한국 시간 기준)
 * 
 * 서버 타임존에 관계없이 한국 시간(KST, UTC+9) 기준으로 계산합니다.
 * - 한국 시간 00:00~01:30 사이는 전날의 학습일
 * - 한국 시간 01:30~07:30 사이는 전날의 학습일 (학습 시간 외)
 * - 한국 시간 07:30 이후는 해당 날짜의 학습일
 * 
 * @param date - 변환할 날짜/시간 (기본값: 현재 시각, UTC 기준)
 * @returns 학습일 (YYYY-MM-DD 형식의 Date 객체, UTC 자정 기준)
 */
export function getStudyDate(date: Date = new Date()): Date {
  // 한국 시간으로 변환 (UTC + 9시간)
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstTime = new Date(date.getTime() + KST_OFFSET_MS);
  
  const kstHours = kstTime.getUTCHours();
  const kstMinutes = kstTime.getUTCMinutes();
  
  // 한국 시간 기준으로 학습일 계산
  // 00:00~07:30 KST는 전날의 학습일 (01:30까지가 학습시간이고, 01:30~07:30은 새벽 공백)
  const isBeforeStartTime = kstHours < DAY_CONFIG.startHour || 
    (kstHours === DAY_CONFIG.startHour && kstMinutes < DAY_CONFIG.startMinute);
  
  // 한국 시간 기준 날짜 (UTC 자정으로 반환)
  const studyDate = new Date(Date.UTC(
    kstTime.getUTCFullYear(),
    kstTime.getUTCMonth(),
    kstTime.getUTCDate(),
    0, 0, 0, 0
  ));
  
  if (isBeforeStartTime) {
    studyDate.setUTCDate(studyDate.getUTCDate() - 1);
  }
  
  return studyDate;
}

/**
 * 현재 시각이 학습 시간 내인지 확인
 * 학습 시간: 07:30 ~ 다음날 01:30
 * 
 * @param date - 확인할 날짜/시간 (기본값: 현재 시각)
 * @returns 학습 시간 내 여부
 */
export function isWithinStudyDay(date: Date = new Date()): boolean {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  const startMinutes = DAY_CONFIG.startHour * 60 + DAY_CONFIG.startMinute; // 07:30 = 450
  const endMinutes = (DAY_CONFIG.endHour - 24) * 60 + DAY_CONFIG.endMinute; // 01:30 = 90
  
  // 07:30 ~ 23:59 또는 00:00 ~ 01:30
  return totalMinutes >= startMinutes || totalMinutes < endMinutes;
}

/**
 * 특정 학습일의 시작/종료 시각을 반환 (한국 시간 기준)
 * 
 * 서버 타임존에 관계없이 한국 시간(KST, UTC+9) 기준으로 계산합니다.
 * - 시작: 해당 날짜 07:30 KST = 전날 22:30 UTC
 * - 종료: 다음 날짜 01:30 KST = 해당 날짜 16:30 UTC
 * 
 * @param studyDate - 학습일 (Date 객체 또는 YYYY-MM-DD 문자열)
 * @returns { start: Date, end: Date } 학습일의 시작/종료 시각 (UTC)
 */
export function getStudyDayBounds(studyDate: Date | string): { start: Date; end: Date } {
  // YYYY-MM-DD 문자열로 정규화
  const dateStr = typeof studyDate === 'string' 
    ? studyDate.split('T')[0] 
    : studyDate.toISOString().split('T')[0];
  
  // 한국 시간 기준 시작/종료 시각을 UTC로 계산
  // KST = UTC + 9시간, 따라서 KST 07:30 = UTC 22:30 (전날)
  const KST_OFFSET_HOURS = 9;
  
  // 시작: 해당 날짜 07:30 KST = 전날 22:30 UTC
  const startHourUTC = DAY_CONFIG.startHour - KST_OFFSET_HOURS; // 7 - 9 = -2 = 전날 22시
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 1); // 전날로 이동
  start.setUTCHours(24 + startHourUTC, DAY_CONFIG.startMinute, 0, 0); // 22:30 UTC
  
  // 종료: 다음 날짜 01:30 KST = 해당 날짜 16:30 UTC
  const endHourUTC = (DAY_CONFIG.endHour - 24) - KST_OFFSET_HOURS; // 1 - 9 = -8 → 전날 16시 = 해당 날짜 16시 (다음날 01:30 KST)
  const end = new Date(`${dateStr}T00:00:00.000Z`);
  end.setUTCHours(24 + endHourUTC, DAY_CONFIG.endMinute, 0, 0); // 16:30 UTC
  
  return { start, end };
}

/**
 * 주의 시작일(일요일) 반환
 * 
 * @param date - 기준 날짜 (기본값: 현재 날짜)
 * @returns 해당 주의 시작일 (일요일)
 */
export function getWeekStart(date: Date = new Date()): Date {
  const studyDate = getStudyDate(date);
  const dayOfWeek = studyDate.getDay();
  const diff = dayOfWeek - DAY_CONFIG.weekStartsOn;
  
  const weekStart = new Date(studyDate);
  weekStart.setDate(weekStart.getDate() - diff);
  weekStart.setHours(0, 0, 0, 0);
  
  return weekStart;
}

/**
 * 날짜를 한국어 형식으로 포맷 (M월 D일)
 */
export function formatDateKorean(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일`;
}

/**
 * 시간을 한국어 형식으로 포맷 (오전/오후 H시 M분)
 */
export function formatTimeKorean(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours < 12 ? '오전' : '오후';
  const displayHours = hours % 12 || 12;
  
  if (minutes === 0) {
    return `${period} ${displayHours}시`;
  }
  return `${period} ${displayHours}시 ${minutes}분`;
}

/**
 * 부재 스케줄의 면제 구간 계산 (버퍼 포함)
 * 
 * @param schedule - 부재 스케줄 정보
 * @param baseDate - 기준 날짜
 * @returns { start: Date, end: Date } 면제 구간 시작/종료 시각
 */
export function getAbsenceExemptionRange(
  schedule: StudentAbsenceSchedule,
  baseDate: Date
): { start: Date; end: Date } {
  const scheduleStart = parse(schedule.start_time, 'HH:mm:ss', baseDate);
  const scheduleEnd = parse(schedule.end_time, 'HH:mm:ss', baseDate);
  const bufferMinutes = schedule.buffer_minutes || ABSENCE_BUFFER_MINUTES;
  
  return {
    start: subMinutes(scheduleStart, bufferMinutes),
    end: addMinutes(scheduleEnd, bufferMinutes),
  };
}
