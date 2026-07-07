import { PushTokenListener } from '@/components/PushTokenListener';
import { PushPermissionProvider } from '@/components/shared/push-permission-provider';

export default function StudentRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className='bg-background min-h-screen'>
      <PushTokenListener />
      <PushPermissionProvider>{children}</PushPermissionProvider>
    </div>
  );
}
