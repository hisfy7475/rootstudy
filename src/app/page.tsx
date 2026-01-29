import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-primary">
            독서실 학습관리 시스템
          </CardTitle>
          <CardDescription>
            학습시간 관리, 몰입도 측정, 등원 목표 관리
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link href="/login" className="block">
            <Button className="w-full" size="lg">
              로그인
            </Button>
          </Link>
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
