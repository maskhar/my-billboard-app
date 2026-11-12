// backend/src/auth/nextauth-session.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { NextAuthSessionService } from './nextauth-session.service';
import { RequestWithUser } from './auth-user';

/**
 * Guard global default. Membaca cookie session NextAuth,Seat di
 * `@Public()`. Guard ini menggantikan passport-jwt karena cookie NextAuth
 * berupa JWE, bukan JWS.
 *
 * Dipasang lewat `APP_GUARD` di app.module.ts, jadi endpoint baru otomatis
 * terproteksi kecuali ditandai `@Public()`.
 */
@Injectable()
export class NextAuthSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly session: NextAuthSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const user = await this.session.resolve(req);

    if (!user) {
      throw new UnauthorizedException('Sesi tidak valid atau sudah berakhir. Silakan login ulang.');
    }

    req.user = user;
    return true;
  }
}
