// src/app/api/user/change-password/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ message: 'Tidak terautentikasi.' }, { status: 401 });
    }

    try {
        const { currentPassword, newPassword } = await req.json();

        if (!currentPassword || !newPassword) {
            return NextResponse.json({ message: 'Semua field password harus diisi.' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
        });

        if (!user || !user.password) {
            return NextResponse.json({ message: 'Pengguna tidak ditemukan atau tidak memiliki password (mungkin login via Google?).' }, { status: 404 });
        }

        // Cek apakah password saat ini cocok
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return NextResponse.json({ message: 'Password saat ini salah.' }, { status: 403 }); // 403 Forbidden
        }

        // Hash password baru
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update password di database
        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                password: hashedNewPassword,
            },
        });

        return NextResponse.json({ message: 'Password berhasil diubah.' }, { status: 200 });

    } catch (error) {
        console.error("Error changing password:", error);
        return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
    }
}
