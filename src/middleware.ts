// src/middleware.ts
//
// Gerbang autentikasi tingkat edge.
//
// Sebelum file ini ada, 13 dari 34 route API tidak memanggil getServerSession
// sama sekali. Middleware ini menutup celah itu secara menyeluruh: setiap
// permintaan ke matcher di bawah wajib membawa token valid sebelum menyentuh
// route handler.
//
// PENTING: ini lapisan pertama, bukan satu-satunya. Tiap route handler tetap
// wajib memverifikasi kepemilikan data (mis. order.userId === session.user.id).
// Middleware hanya menjawab "siapa kamu", bukan "boleh lihat data yang mana".

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CS', 'OPERATOR'];

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = req.nextauth.token?.role as string | undefined;

    const isAdminArea =
      pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

    if (isAdminArea && (!role || !ADMIN_ROLES.includes(role))) {
      // Route API menjawab dengan status, halaman dialihkan.
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Mengembalikan false memicu redirect ke halaman login (atau 401 untuk API).
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  }
);

export const config = {
  matcher: [
    // Area admin — halaman & API. /admin/login dikecualikan di bawah.
    '/admin/((?!login).*)',
    '/api/admin/:path*',

    // Area pengguna terautentikasi.
    '/dashboard/:path*',
    '/checkout/:path*',
    '/invoice/:path*',

    // API yang bertindak atas nama pengguna.
    '/api/booking/:path*',
    '/api/upload/:path*',
    '/api/user/:path*',
  ],
};
