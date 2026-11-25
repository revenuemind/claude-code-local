import { requireActor } from '@/lib/server/session';
import { Brands } from '@/components/pages/Brands';

export default async function Page() { await requireActor(); return <Brands />; }
