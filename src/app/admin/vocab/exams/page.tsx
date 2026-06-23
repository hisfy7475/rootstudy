import { requireAdminBranch } from '@/lib/auth/admin-context';
import { getAdminVocabExams, getVocabPackOptions } from '@/lib/actions/vocab';
import { getStudentTypes } from '@/lib/actions/student-type';
import { getAllBranches } from '@/lib/actions/branch';
import { VocabAdminTabs } from '../vocab-admin-tabs';
import ExamsClient from './exams-client';

export default async function AdminVocabExamsPage() {
  const ctx = await requireAdminBranch();
  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }

  const [rows, packs, studentTypes, branches] = await Promise.all([
    getAdminVocabExams({}),
    getVocabPackOptions(),
    getStudentTypes(),
    ctx.isSuperAdmin ? getAllBranches() : Promise.resolve([]),
  ]);

  return (
    <div className='space-y-4 p-4 sm:p-6'>
      <h1 className='text-text text-xl font-bold'>영단어 시험 관리</h1>
      <VocabAdminTabs active='exams' isSuperAdmin={ctx.isSuperAdmin} />
      <ExamsClient
        initialRows={rows}
        packs={packs}
        studentTypes={studentTypes.map((t) => ({ id: t.id, name: t.name }))}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        isSuperAdmin={ctx.isSuperAdmin}
      />
    </div>
  );
}
