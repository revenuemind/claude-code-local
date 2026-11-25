import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/server/session';

export default async function Home() {
  const actor = await currentActor().catch(() => null);
  redirect(actor ? '/dashboard' : '/login');
}
