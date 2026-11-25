import type { Role, Permission } from '../auth/rbac';
import { can } from '../auth/rbac';

/** The authenticated caller. Every service call is scoped by `orgId`. */
export interface Actor {
  userId: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  role: Role;
  isPlatformAdmin: boolean;
  uiLocale: string;
  sessionId?: string;
  ip?: string | null;
}

export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do this') => new AppError(403, 'forbidden', msg);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'bad_request', msg, details);
export const conflict = (msg: string, details?: unknown) => new AppError(409, 'conflict', msg, details);
export const limitReached = (msg: string, details?: unknown) => new AppError(402, 'limit_reached', msg, details);

export function assertCan(actor: Actor, perm: Permission): void {
  if (!can(actor.role, perm)) throw forbidden(`Your role (${actor.role}) cannot perform “${perm}”.`);
}

export function assertPlatformAdmin(actor: Actor): void {
  if (!actor.isPlatformAdmin) throw forbidden('Platform administrators only');
}
