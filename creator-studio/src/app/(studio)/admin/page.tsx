import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/server/session';
import { Admin } from '@/components/pages/Admin';

export default async function Page() { const a = await requireActor(); if (!a.isPlatformAdmin) notFound(); return <Admin />; }
