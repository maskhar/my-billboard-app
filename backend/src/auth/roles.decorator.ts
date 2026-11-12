// backend/src/auth/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Membatasi akses ke role tertentu. Digunakan bersama `AdminGuard`, mis.
 * `@Roles('ADMIN')`.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
