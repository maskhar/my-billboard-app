// src/types/next-auth.d.ts
//
// Perluasan tipe NextAuth.
//
// `session.user.role` dan `session.user.id` dipakai di 23 lokasi, tetapi
// sebelumnya tidak pernah dideklarasikan — kesalahannya tertutup oleh
// `ignoreBuildErrors` di next.config.ts (task 8.1). Deklarasi ini membuat
// pemeriksa tipe benar-benar memvalidasi pemanggilan tersebut.

// `role` memakai tipe `Role` dari Prisma, bukan `string`. Dengan `string`,
// salah ketik seperti `'ADMINN'` atau `'admin'` lolos pemeriksaan tipe dan
// baru ketahuan sebagai "kenapa saya tidak bisa masuk" di layar pengguna.
// Sekarang ~30 pengecekan role di seluruh aplikasi divalidasi saat kompilasi.

import 'next-auth';
import 'next-auth/jwt';
import type { Role } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    role: Role;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    picture?: string | null;
  }
}
