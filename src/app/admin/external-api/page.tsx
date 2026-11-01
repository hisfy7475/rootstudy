import { redirect } from 'next/navigation';
import { getAllBranches } from '@/lib/actions/branch';
import { getExternalApiKeys } from '@/lib/actions/external-api';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import ExternalApiClient from './external-api-client';

export default async function ExternalApiPage() {
  const ctx = await requireAdminBranch();
  if (!ctx || !ctx.isSuperAdmin) redirect('/admin');

  const [keys, branches] = await Promise.all([getExternalApiKeys(), getAllBranches()]);

  return (
    <ExternalApiClient
      initialKeys={keys}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
    />
  );
}
