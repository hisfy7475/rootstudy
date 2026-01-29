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
 * 실제 날짜/시간을 학습일로 변환
 * 새벽 01:30 이전(00:00~01:30)은 전날의 학습일로 처리
 * 
 * @param date - 변환할 날짜/시간 (기본값: 현재 시각)
 * @returns 학습일 (YYYY-MM-DD 형식의 Date 객체, 시간은 00:00:00)
 */
export function getStudyDate(date: Date = new Date()): Date {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  
  // 자정~01:30 사이는 전날의 학습일
  const isBeforeEndTime = hours < 1 || (hours === 1 && minutes < DAY_CONFIG.endMinute);
  
  const studyDate = new Date(date);
  studyDate.setHours(0, 0, 0, 0);
  
  if (isBeforeEndTime) {
    studyDate.setDate(studyDate.getDate() - 1);
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
 * 특정 학습일의 시작/종료 시각을 반환
 * 
 * @param studyDate - 학습일 (Date 객체 또는 YYYY-MM-DD 문자열)
 * @returns { start: Date, end: Date } 학습일의 시작/종료 시각
 */
export function getStudyDayBounds(studyDate: Date | string): { start: Date; end: Date } {
  const date = typeof studyDate === 'string' ? new Date(studyDate) : new Date(studyDate);
  date.setHours(0, 0, 0, 0);
  
  // 시작: 해당 날짜 07:30
  const start = new Date(date);
  start.setHours(DAY_CONFIG.startHour, DAY_CONFIG.startMinute, 0, 0);
  
  // 종료: 다음 날짜 01:30
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  end.setHours(DAY_CONFIG.endHour - 24, DAY_CONFIG.endMinute, 0, 0);
  
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
