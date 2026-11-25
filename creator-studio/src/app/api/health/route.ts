import { api } from '@/lib/server/api';
export const GET = api(async () => ({ ok: true, time: new Date().toISOString() }), { auth: false });
