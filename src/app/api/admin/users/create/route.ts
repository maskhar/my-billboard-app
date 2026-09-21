// src/app/api/admin/users/create/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, role } = body;

    // 1. Validasi input dasar
    if (!name || !email || !password || !role) {
      return NextResponse.json({ message: 'Semua field harus diisi.' }, { status: 400 });
    }

    // 2. Cek apakah email sudah ada
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ message: 'Email sudah terdaftar.' }, { status: 409 }); // 409 Conflict
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Buat user baru di database
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        // Set default values for other required fields if any
        authProvider: 'EMAIL', // Default for manual creation
        isVerified: true, // Admin-created users are verified by default
      },
    });

    // Jangan kirim balik password hash di response
    const { password: _, ...userWithoutPassword } = newUser;

    return NextResponse.json(userWithoutPassword, { status: 201 }); // 201 Created

  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }
}
