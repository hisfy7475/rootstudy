import { Sidebar } from '@/components/shared/sidebar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar basePath="/admin" />
      <main className="ml-64 min-h-screen">{children}</main>
    </div>
  );
}
