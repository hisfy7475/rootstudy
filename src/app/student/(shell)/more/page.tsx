import Link from 'next/link';
import {
  GraduationCap,
  UtensilsCrossed,
  FileBarChart2,
  Award,
  Megaphone,
  Bell,
  Settings,
  Target,
  BookOpen,
  ChevronRight,
} from 'lucide-react';

const links = [
  { href: '/student/mentoring', label: '멘토링', icon: GraduationCap },
  { href: '/student/order', label: '급식 · 모의고사', icon: UtensilsCrossed },
  { href: '/student/report', label: '리포트', icon: FileBarChart2 },
  { href: '/student/points', label: '상벌점', icon: Award },
  { href: '/student/announcements', label: '공지사항', icon: Megaphone },
  { href: '/student/notifications', label: '알림', icon: Bell },
  { href: '/student/focus', label: '집중도', icon: Target },
  { href: '/student/subject', label: '과목', icon: BookOpen },
  { href: '/student/settings', label: '설정', icon: Settings },
];

export default function StudentMorePage() {
  return (
    <div className='px-4 pt-4 pb-6'>
      <h1 className='mb-1 text-xl font-bold'>더보기</h1>
      <p className='text-muted-foreground mb-4 text-sm'>자주 쓰는 메뉴입니다.</p>
      <ul className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className='active:bg-muted/50 flex items-center gap-3 px-4 py-3.5 transition-colors'
            >
              <Icon className='text-primary h-5 w-5 shrink-0' />
              <span className='text-foreground flex-1 font-medium'>{label}</span>
              <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
