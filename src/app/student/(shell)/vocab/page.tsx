import Link from 'next/link';
import { BookOpen, PencilLine, RotateCcw, History, ChevronRight } from 'lucide-react';

const items = [
  {
    href: '/student/vocab/preview',
    label: '예습하기',
    desc: '단어 꾸러미를 골라 미리 학습해요',
    icon: BookOpen,
  },
  {
    href: '/student/vocab/review',
    label: '복습하기',
    desc: '이번 주 틀린 단어만 모아 복습해요',
    icon: RotateCcw,
  },
  {
    href: '/student/vocab/exam',
    label: '시험보기',
    desc: '최대 40문제 · 10분 · 하루 1회',
    icon: PencilLine,
  },
  {
    href: '/student/vocab/history',
    label: '응시내역',
    desc: '지난 결과와 오답을 확인해요',
    icon: History,
  },
];

export default function StudentVocabHome() {
  return (
    <div className='space-y-3 px-4 pt-4 pb-6'>
      <h1 className='text-foreground text-lg font-bold'>영단어 시험</h1>
      <ul className='space-y-3'>
        {items.map(({ href, label, desc, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className='border-border bg-card active:bg-muted/50 flex items-center gap-3 rounded-2xl border px-4 py-4 transition-colors'
            >
              <Icon className='text-primary h-6 w-6 shrink-0' />
              <div className='flex-1'>
                <p className='text-foreground font-semibold'>{label}</p>
                <p className='text-muted-foreground text-sm'>{desc}</p>
              </div>
              <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
