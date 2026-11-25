import { requireActor } from '@/lib/server/session';
import { Shell } from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const a = await requireActor();
  return <Shell actor={{ name: a.name, email: a.email, orgName: a.orgName, orgId: a.orgId, role: a.role, isPlatformAdmin: a.isPlatformAdmin }}>{children}</Shell>;
}
