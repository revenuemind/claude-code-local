import { requireActor } from '@/lib/server/session';
import { can } from '@/lib/auth/rbac';
import { TeamPage } from '@/components/pages/Simple';

export default async function Page() { const a = await requireActor(); return <TeamPage canManage={can(a.role, 'members.manage')} me={a.userId} />; }
