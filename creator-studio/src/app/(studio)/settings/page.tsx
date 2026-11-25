import { requireActor } from '@/lib/server/session';
import { SettingsPage } from '@/components/pages/Simple';

export default async function Page() { const a = await requireActor(); return <SettingsPage name={a.name} />; }
