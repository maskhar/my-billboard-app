// backend/src/auth/nextauth-session.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getToken } from 'next-auth/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth-user';
import { getNextAuthSessionCookieName } from './nextauth-cookie';

/** Bagian Express request yang dibutuhkan next-auth untuk membaca session. */
export interface CookieCarrier {
  cookies?: Record<string, string>;
  headers?: Record<string, unknown>;
}

/**
 * Membaca & mendekode cookie session NextAuth milik frontend.
 *
 * Kenapa pakai `getToken()` dari `next-auth/jwt` dan bukan passport-jwt:
 * cookie session NextAuth adalah JWE terenkripsi (alg `dir`, enc `A256GCM`),
 * sedangkan passport-jwt hanya bisa memverifikasi JWS bertanda tangan lewat
 * `jsonwebtoken.verify`. Keduanya tidak kompatibel.
 *
 * `getToken()` juga otomatis menyambung cookie yang terpecah (next-auth pecah
 * JWE > 4096 byte menjadi `next-auth.session-token.0`, `.1`, dst).
 */
@Injectable()
export class NextAuthSessionService {
  private readonly logger = new Logger(NextAuthSessionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Nama cookie yang dibaca, mis. `next-auth.session-token`. */
  get cookieName(): string {
    return getNextAuthSessionCookieName(this.config.get<string>('NEXTAUTH_URL'));
  }

  /**
   * Ubah request menjadi AuthUser, atau null bila tidak ada / tidak valid /
   * kedaluwarsa. Tidak pernah melempar error.
   */
  async resolve(req: CookieCarrier): Promise<AuthUser | null> {
    const token = await this.readToken(req);
    if (!token?.id) return null;

    let role: string | null = (token.role as string) ?? null;

    // Cookie lama bisa dibuat sebelum field `role` pernah ditulis ke token
    // (callback `jwt` di src/lib/auth.ts hanya mengisinya saat login pertama).
    // Supaya user aktif tidak terlempar keluar, ambil role terbaru dari DB.
    if (!role) {
      const dbRole = await this.loadRoleFromDb(token.id as string);
      if (dbRole === undefined) {
        // User tidak ada di DB lagi (akun dihapus) — cookie-nya tidak berlaku.
        return null;
      }
      role = dbRole;
    }

    return {
      id: token.id as string,
      email: (token.email as string) ?? null,
      role,
      name: (token.name as string) ?? null,
      picture: (token.picture as string) ?? null,
    };
  }

  private async readToken(req: CookieCarrier) {
    const secret = this.config.get<string>('NEXTAUTH_SECRET');
    if (!secret) {
      this.logger.error('NEXTAUTH_SECRET belum di-set di backend/.env — session tidak bisa diverifikasi.');
      return null;
    }

    // `getToken()` hanya menyentuh req.cookies (untuk session cookie) dan
    // req.headers (fallback header Authorization: Bearer).
    const tokenRequest = { cookies: req.cookies, headers: req.headers } as unknown as
      Parameters<typeof getToken>[0]['req'];

    try {
      return await getToken({
        req: tokenRequest,
        secret,
        secureCookie: this.cookieName.startsWith('__Secure-'),
      });
    } catch (error) {
      this.logger.warn(`Gagal mendekode session: ${(error as Error).message}`);
      return null;
    }
  }

  /** `undefined` = user tidak ada di DB, `null` = ada tapi role kosong. */
  private async loadRoleFromDb(userId: string): Promise<string | null | undefined> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!user) return undefined;
      return user.role ?? null;
    } catch (error) {
      this.logger.error(`Gagal ambil role user ${userId}: ${(error as Error).message}`);
      return null;
    }
  }
}
