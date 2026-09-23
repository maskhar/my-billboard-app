// src/app/api/admin/users/update-account/route.ts
//
// Sebelumnya route ini tidak memanggil getServerSession sama sekali: siapa pun
// bisa POST dan mengubah user mana pun. Body di-spread langsung ke Prisma
// (mass-assignment), sehingga `role` dan `password` bisa ditulis bebas —
// termasuk menaikkan diri sendiri jadi SUPER_ADMIN. Respons pun mengembalikan
// seluruh baris user, lengkap dengan hash password dan kode OTP.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Field yang boleh diubah lewat route ini. Sengaja ditulis eksplisit:
// `role`, `password`, `email`, `isVerified`, dan kolom OTP TIDAK ada di sini.
const FIELD_AKUN_DIIZINKAN = ['username', 'whatsapp'] as const;

// Kolom yang aman dikirim balik ke client.
const SELECT_AMAN = {
  id: true,
  name: true,
  email: true,
  username: true,
  whatsapp: true,
  role: true,
  isVerified: true,
  authProvider: true,
  createdAt: true,
} as const;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ message: 'userId wajib diisi.' }, { status: 400 });
    }

    // Tolak secara tegas, bukan sekadar diabaikan, agar penyalahgunaan terlihat.
    if ('role' in body) {
      return NextResponse.json(
        { message: 'Role tidak dapat diubah melalui endpoint ini.' },
        { status: 400 }
      );
    }

    if ('password' in body) {
      return NextResponse.json(
        { message: 'Password tidak dapat diubah melalui endpoint ini.' },
        { status: 400 }
      );
    }

    // Allowlist: hanya field yang terdaftar yang diteruskan ke Prisma.
    const data: Record<string, string | null> = {};
    for (const field of FIELD_AKUN_DIIZINKAN) {
      const nilai = body[field];
      if (nilai === undefined) continue;
      if (nilai !== null && typeof nilai !== 'string') {
        return NextResponse.json(
          { message: `Field ${field} harus berupa teks.` },
          { status: 400 }
        );
      }
      data[field] = nilai;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ message: 'Tidak ada data yang diubah.' }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: SELECT_AMAN,
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error updating user account:', error);
    return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }
}
