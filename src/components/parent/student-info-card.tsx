'use client';

import { Card } from '@/components/ui/card';
import { User, MapPin, Phone } from 'lucide-react';

interface StudentInfoCardProps {
  name: string;
  seatNumber?: number | null;
  phone?: string | null;
}

export function StudentInfoCard({ name, seatNumber, phone }: StudentInfoCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        {/* 프로필 아이콘 */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
          <User className="w-7 h-7 text-primary" />
        </div>
        
        {/* 학생 정보 */}
        <div className="flex-1">
          <h2 className="text-lg font-bold text-text">{name}</h2>
          <div className="flex flex-wrap gap-3 mt-1">
            {seatNumber && (
              <div className="flex items-center gap-1 text-sm text-text-muted">
                <MapPin className="w-3.5 h-3.5" />
                <span>{seatNumber}번 좌석</span>
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-1 text-sm text-text-muted">
                <Phone className="w-3.5 h-3.5" />
                <span>{phone}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
