// backend/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NextAuthSessionService } from './nextauth-session.service';
import { NextAuthSessionGuard } from './nextauth-session.guard';
import { RolesGuard } from './roles.guard';

/**
 * Autentikasi backend memverifikasi session NextAuth frontend secara langsung:
 * backend membaca cookie `next-auth.session-token` (JWE) dan mendekodenya dengan
 * NEXTAUTH_SECRET yang sama. Tidak ada sistem token terpisah.
 */
@Module({
  imports: [PrismaModule],
  providers: [NextAuthSessionService, NextAuthSessionGuard, RolesGuard],
  exports: [NextAuthSessionService, NextAuthSessionGuard, RolesGuard],
})
export class AuthModule {}
