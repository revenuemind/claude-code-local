import { requireActor } from '@/lib/server/session';
import { can } from '@/lib/auth/rbac';
import { Engines } from '@/components/pages/Engines';

export default async function Page() { const a = await requireActor(); return <Engines canManage={can(a.role, 'engine.manage')} />; }
