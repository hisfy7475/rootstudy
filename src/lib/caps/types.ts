// CAPS 출입관리 시스템 관련 타입 정의

// CAPS DB의 tenter 테이블 레코드
export interface CapsEnterRecord {
  e_date: string;      // 날짜 (YYYYMMDD)
  e_time: string;      // 시간 (HHmmss)
  g_id: number;        // 게이트 ID
  e_id: number;        // 사용자 ID
  e_idno: string;      // 학번 (CAPS ID)
  e_name: string;      // 이름
}

// CAPS DB의 tgate 테이블 레코드
export interface CapsGate {
  id: number;
  name: string;
  ip: string;
}

// CAPS DB의 tuser 테이블 레코드
export interface CapsUser {
  id: number;
  name: string;
}

// 출입 타입
export type AttendanceType = 'check_in' | 'check_out';

// 동기화 결과
export interface SyncResult {
  success: boolean;
  recordsSynced: number;
  lastCapsDatetime: string | null;
  error?: string;
}

// CAPS 연결 설정
export interface CapsConfig {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
}
