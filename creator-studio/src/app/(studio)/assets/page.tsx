import { requireActor } from '@/lib/server/session';
import { Assets } from '@/components/pages/Assets';

export default async function Page() { await requireActor(); return <Assets />; }
