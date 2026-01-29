import { getLinkedStudents } from '@/lib/actions/parent';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const students = await getLinkedStudents();

  return <SettingsClient students={students} />;
}
