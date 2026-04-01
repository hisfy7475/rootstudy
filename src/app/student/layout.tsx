import { PushTokenListener } from '@/components/PushTokenListener';

export default function StudentRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <PushTokenListener />
      {children}
    </div>
  );
}
