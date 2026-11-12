// backend/src/auth/roles.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { RequestWithUser } from './auth-user';

/**
 * Menolak request yang role-nya tidak termasuk daftar di `@Roles(...)`.
 * Hanya berlaku pada handler yang memakai decorator itu; endpoint tanpa
 * `@Roles()` tidak terpengaruh.
 *
 * Dipasang sebagai APP_GUARD kedua, setelah NextAuthSessionGuard, supaya
 * `req.user` sudah terisi.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user) {
      // NextAuthSessionGuard seharusnya sudah menolak lebih dulu.
      return false;
    }

    if (!req.user.role || !required.includes(req.user.role)) {
      throw new ForbiddenException('Anda tidak punya akses ke sumber daya ini.');
    }
    return true;
  }
}
