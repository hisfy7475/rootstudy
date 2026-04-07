import Link from 'next/link';
import { UtensilsCrossed, FileBarChart2, Megaphone, Settings, ChevronRight } from 'lucide-react';

const links = [
  { href: '/parent/meals', label: '급식', icon: UtensilsCrossed },
  { href: '/parent/report', label: '리포트', icon: FileBarChart2 },
  { href: '/parent/announcements', label: '공지사항', icon: Megaphone },
  { href: '/parent/settings', label: '설정', icon: Settings },
];

export default function ParentMorePage() {
  return (
    <div className="px-4 pt-4 pb-6">
      <h1 className="text-xl font-bold mb-1">더보기</h1>
      <p className="text-sm text-muted-foreground mb-4">자주 쓰는 메뉴입니다.</p>
      <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 transition-colors"
            >
              <Icon className="w-5 h-5 text-primary shrink-0" />
              <span className="flex-1 font-medium text-foreground">{label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
