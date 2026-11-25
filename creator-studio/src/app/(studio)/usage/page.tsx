import { requireActor } from '@/lib/server/session';
import { UsagePage } from '@/components/pages/Simple';

export default async function Page() { await requireActor(); return <UsagePage />; }
