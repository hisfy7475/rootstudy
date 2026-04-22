import type { Mentor, MentoringApplication, MentoringSlot } from '@/types/database';

/** KST 기준 슬롯 시작 시각 (ms) */
export function mentoringSlotStartMs(dateYmd: string, startTime: string): number {
  const t = startTime.length >= 8 ? startTime.slice(0, 8) : `${startTime}:00`.slice(0, 8);
  return new Date(`${dateYmd}T${t}+09:00`).getTime();
}

export type MentoringSlotWithMentor = MentoringSlot & {
  mentors: Pick<Mentor, 'id' | 'name' | 'subject'> | null;
};

export type MentoringApplicationWithDetails = MentoringApplication & {
  mentoring_slots:
    | (MentoringSlot & {
        mentors: Pick<Mentor, 'name' | 'subject'> | null;
      })
    | null;
  student_profile: { name: string } | null;
};
