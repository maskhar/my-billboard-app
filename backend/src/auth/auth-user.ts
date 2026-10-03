// backend/src/auth/auth-user.ts
import { Request } from 'express';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Identitas user yang sudah diverifikasi dari cookie session NextAuth.
 * Field `id` dan `role` diambil dari JWE cookie NextAuth (lihat src/lib/auth.ts
 * callback `jwt`), bukan dari request body — jadi tidak bisa dipalsukan client.
 */
export interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
  name?: string | null;
  picture?: string | null;
}

export interface RequestWithUser extends Request {
  user?: AuthUser;
}

/**
 * `@CurrentUser()` — menyuntikkan AuthUser ke handler.
 *
 * Contoh: async update(@CurrentUser() user: AuthUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<RequestWithUser>().user,
);
