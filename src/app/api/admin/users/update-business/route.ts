// src/app/api/admin/users/update-business/route.ts
//
// Sama seperti update-account: sebelumnya tanpa autentikasi, dan pola
// `const { userId, ...data }` di-spread langsung ke prisma.user.update adalah
// mass-assignment — body apa pun (termasuk `role`, `password`, `isVerified`)
// ikut tertulis ke database. Diganti allowlist eksplisit.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Hanya data profil bisnis. `role`, `password`, `email`, `isVerified`, dan
// kolom OTP sengaja tidak ada di daftar ini.
const FIELD_BISNIS_DIIZINKAN = [
  'name',
  'companyName',
  'ktp',
  'npwp',
  'ktpAddress',
  'officeAddress',
] as const;

const SELECT_AMAN = {
  id: true,
  name: true,
  email: true,
  companyName: true,
  ktp: true,
  npwp: true,
  ktpAddress: true,
  officeAddress: true,
  role: true,
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

    const data: Record<string, string | null> = {};
    for (const field of FIELD_BISNIS_DIIZINKAN) {
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
    console.error('Error updating business details:', error);
    return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }
}
