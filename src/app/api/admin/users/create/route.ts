// src/app/api/admin/users/create/route.ts
//
// Sebelumnya route ini tanpa autentikasi: siapa pun bisa POST dan membuat akun
// SUPER_ADMIN untuk dirinya sendiri, karena `role` diambil mentah dari body.
// Sekarang: wajib sesi admin, dan hanya SUPER_ADMIN yang boleh menentukan role.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { Role, daftarNilai, sahRole } from '@/lib/enum-guard';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, email, password, role } = body;

    // 1. Validasi input dasar
    if (!name || !email || !password) {
      return NextResponse.json({ message: 'Semua field harus diisi.' }, { status: 400 });
    }

    // 2. Tentukan role. Hanya SUPER_ADMIN yang boleh mengangkat role apa pun;
    //    ADMIN biasa selalu membuat akun USER, berapa pun isi body-nya.
    //    Daftar role sekarang berasal dari enum Prisma, bukan array terpisah
    //    yang harus diingat untuk ikut diperbarui setiap kali role bertambah.
    let roleFinal: Role = Role.USER;
    if (session.user.role === 'SUPER_ADMIN' && role) {
      if (!sahRole(role)) {
        return NextResponse.json(
          { message: `Role tidak valid. Nilai yang sah: ${daftarNilai(Role)}` },
          { status: 400 }
        );
      }
      roleFinal = role;
    }

    // 3. Cek apakah email sudah ada
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ message: 'Email sudah terdaftar.' }, { status: 409 }); // 409 Conflict
    }

    // 4. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. Buat user baru. Field sensitif (isVerified, authProvider, otp*) diset
    //    di server, tidak pernah diambil dari body.
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: roleFinal,
        authProvider: 'EMAIL', // Default untuk pembuatan manual
        isVerified: true, // Akun buatan admin dianggap terverifikasi
      },
      // Select eksplisit: hash password dan kolom OTP tidak ikut terkirim.
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isVerified: true,
        authProvider: true,
        createdAt: true,
      },
    });

    return NextResponse.json(newUser, { status: 201 }); // 201 Created
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }
}
