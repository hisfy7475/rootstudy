import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardDescription, CardContent } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Image
              src="/logo.png"
              alt="WHEVER STUDY route 관리형 독서실"
              width={200}
              height={80}
              priority
            />
          </div>
          <CardDescription>
            학습시간 관리, 몰입도 측정, 등원 목표 관리
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Link href="/login" className="flex-1">
              <Button className="w-full" size="lg">
                로그인
              </Button>
            </Link>
            <span className="text-sm text-muted-foreground whitespace-nowrap">(회원 전용)</span>
          </div>
          <div className="flex gap-2">
            <Link href="/signup/student" className="flex-1">
              <Button variant="outline" className="w-full">
                학생 가입
              </Button>
            </Link>
            <Link href="/signup/parent" className="flex-1">
              <Button variant="outline" className="w-full">
                학부모 가입
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
