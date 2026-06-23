import { requireAdminBranch } from '@/lib/auth/admin-context';
import { getAdminVocabPacks } from '@/lib/actions/vocab';
import { VocabAdminTabs } from '../vocab-admin-tabs';
import PacksClient from './packs-client';

export default async function AdminVocabPacksPage() {
  const ctx = await requireAdminBranch();
  if (!ctx || !ctx.isSuperAdmin) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>단어 꾸러미 관리는 슈퍼관리자만 가능합니다.</h1>
      </div>
    );
  }
  const packs = await getAdminVocabPacks();

  return (
    <div className='space-y-4 p-4 sm:p-6'>
      <h1 className='text-text text-xl font-bold'>영단어 시험 관리</h1>
      <VocabAdminTabs active='packs' isSuperAdmin />
      <PacksClient initialPacks={packs} />
    </div>
  );
}
