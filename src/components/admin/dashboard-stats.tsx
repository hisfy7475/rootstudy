'use client';

import { Card } from '@/components/ui/card';
import { Users, UserCheck, UserMinus, Coffee } from 'lucide-react';

interface DashboardStatsProps {
  total: number;
  checkedIn: number;
  checkedOut: number;
  onBreak: number;
}

export function DashboardStats({ total, checkedIn, checkedOut, onBreak }: DashboardStatsProps) {
  const stats = [
    {
      label: '전체 학생',
      value: total,
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: '입실 중',
      value: checkedIn,
      icon: UserCheck,
      color: 'text-green-600',
      bgColor: 'bg-success/30',
    },
    {
      label: '퇴실',
      value: checkedOut,
      icon: UserMinus,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
    },
    {
      label: '외출 중',
      value: onBreak,
      icon: Coffee,
      color: 'text-yellow-600',
      bgColor: 'bg-warning/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm text-text-muted">{stat.label}</p>
              <p className="text-2xl font-bold">{stat.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
