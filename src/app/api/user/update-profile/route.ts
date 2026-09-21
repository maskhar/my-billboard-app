// src/app/api/user/update-profile/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ message: 'Tidak terautentikasi.' }, { status: 401 });
    }

    try {
        const { name, whatsapp } = await req.json();

        if (!name) {
            return NextResponse.json({ message: 'Nama tidak boleh kosong.' }, { status: 400 });
        }

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                name,
                whatsapp,
            },
        });

        return NextResponse.json({ message: 'Profil berhasil diperbarui.' }, { status: 200 });

    } catch (error) {
        console.error("Error updating profile:", error);
        return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
    }
}
