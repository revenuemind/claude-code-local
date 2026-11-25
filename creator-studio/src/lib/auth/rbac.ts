/** Role-based access control. Roles are per organization membership. */
export const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'project.read', 'project.write', 'project.delete',
  'brand.read', 'brand.write',
  'asset.read', 'asset.write',
  'template.read', 'template.write',
  'engine.read', 'engine.manage',
  'generate', 'render', 'publish', 'publish.accounts',
  'members.read', 'members.manage',
  'billing.read', 'billing.manage',
  'audit.read', 'workspace.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ: Permission[] = ['project.read', 'brand.read', 'asset.read', 'template.read', 'engine.read', 'members.read'];
const EDIT: Permission[] = [...READ, 'project.write', 'brand.write', 'asset.write', 'template.write', 'generate', 'render', 'publish'];
const ADMIN: Permission[] = [...EDIT, 'project.delete', 'engine.manage', 'publish.accounts', 'members.manage', 'billing.read', 'audit.read', 'workspace.manage'];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([...ADMIN, 'billing.manage']),
  admin: new Set<Permission>(ADMIN),
  editor: new Set<Permission>(EDIT),
  viewer: new Set<Permission>(READ),
};

export function can(role: Role | null | undefined, perm: Permission): boolean {
  return !!role && !!ROLE_PERMISSIONS[role]?.has(perm);
}

export function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ROLES as readonly string[]).includes(x);
}
