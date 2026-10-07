// src/middleware.ts
//
// Guard otorisasi untuk API admin Next.js. Berjalan di Edge sebelum request
// sampai ke route handler, sehingga route admin yang tadinya tanpa cek sesi
// (update-account, update-business, create, settings GET, chat/*, dll)
// otomatis tertutup tanpa perlu mengubah tiap file route.
//
// Verifikasi sesi memakai getToken() dari next-auth/jwt - pola yang sama
// dengan backend NestJS (Opsi C: NextAuthSessionGuard membaca cookie
// session-token yang sama). Session strategy di src/lib/auth.ts adalah "jwt",
// jadi token payload berisi `role` hasil callback jwt().
//
// Whitelist endpoint publik TIDAK diperlukan di sini karena matcher hanya
// mencakup path yang memang khusus admin. Endpoint yang sengaja publik tidak
// tersentuh middleware ini:
//   - /api/auth/**              (login/register NextAuth, csrf, session)
//   - /api/payment/notify       (punya cek sesi sendiri di route)
//   - /api/proxy?url=...        (laporan trafik, dipakai halaman publik)
//   - /api/proxy/**             (passthrough ke backend; backend yang
//                                menegakkan guard global + @Public/@Roles)
//   - /api/booking/**, /api/upload/**, /api/user/** (di luar scope audit,
//                                punya cek sesi masing-masing)
//   - register & chat/start tamu (langsung ke backend NestJS, @Public)
//
// Catatan role: /api/admin/** memakai ADMIN_ROLES ['ADMIN','SUPER_ADMIN']
// - identik dengan ADMIN_ROLES di backend/src/auth/admin-roles.ts (CS dan
// OPERATOR memang tidak punya scope admin). Server action live-chat/actions.ts
// dibuka juga untuk role CS karena halaman Inbox (/admin/live-chat) adalah
// bagian dari menu kerja CS.

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
const LIVE_CHAT_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CS'];

const jsonError = (status: 401 | 403, message: string) =>
  NextResponse.json({ message }, { status });

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminApi = pathname.startsWith('/api/admin/');
  // Server action diposting ke URL halaman tempat action dipanggil, jadi
  // live-chat/actions.ts dievaluasi lewat POST ke /admin/live-chat.
  // GET/HEAD = render halaman (sudah dijaga layout admin), biarkan lewat.
  const isLiveChatAction =
    pathname === '/admin/live-chat' &&
    req.method !== 'GET' &&
    req.method !== 'HEAD';

  if (!isAdminApi && !isLiveChatAction) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    return jsonError(401, 'Unauthorized: sesi tidak ditemukan. Silakan login ulang.');
  }

  const role = typeof token.role === 'string' ? token.role : '';
  const allowedRoles = isAdminApi ? ADMIN_ROLES : LIVE_CHAT_ROLES;

  if (!allowedRoles.includes(role)) {
    return jsonError(
      403,
      `Forbidden: role "${role || 'tanpa role'}" tidak punya akses ke resource ini.`
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*', '/admin/live-chat'],
};
