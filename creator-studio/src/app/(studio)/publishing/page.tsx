import { Suspense } from 'react';
import { requireActor } from '@/lib/server/session';
import { can } from '@/lib/auth/rbac';
import { Publishing } from '@/components/pages/Publishing';

export default async function Page() { const a = await requireActor(); return <Suspense><Publishing canManage={can(a.role, 'publish.accounts')} /></Suspense>; }
