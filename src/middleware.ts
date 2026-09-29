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
import type { Role } from '@prisma/client';

// SENGAJA BUKAN `peranBoleh` DARI `src/lib/gerbang-peran.ts`
//
// Modul itu mengimpor `Role` sebagai NILAI (`Role.ADMIN`), dan nilai enum
// Prisma ikut menarik client Prisba-nya. Berkas ini berjalan di Edge runtime,
// yang tidak menjalankan Prisma. Jadi di sini `Role` diimpor sebagai TIPE saja
// — terhapus seluruhnya saat build — dan daftarnya diberi anotasi.
//
// Anotasi `readonly Role[]` itu yang penting, bukan sekadar kerapian: tanpanya
// TypeScript melebarkan array ini menjadi `string[]`, dan `string[].includes()`
// menerima teks apa pun. Salah tulis satu huruf (`'SUPER_ADMINN'`) lolos
// kompilasi, gerbangnya menjadi selalu `false`, dan seluruh area /admin
// terkunci untuk peran itu tanpa satu pun galat.
const ADMIN_ROLES: readonly Role[] = ['ADMIN', 'SUPER_ADMIN', 'CS', 'OPERATOR'];

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    // `as Role | undefined`, bukan `as string | undefined`. Keduanya sama-sama
    // cast (token JWT tidak bisa diperiksa compiler), tapi yang ini membuat
    // `ADMIN_ROLES.includes(role)` di bawah benar-benar tervalidasi tipe.
    const role = req.nextauth.token?.role as Role | undefined;

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
