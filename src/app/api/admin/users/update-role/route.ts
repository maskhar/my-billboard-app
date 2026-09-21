// src/app/api/admin/users/update-role/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    // Cek Keamanan: Hanya Admin/SuperAdmin yang boleh akses
    if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
        return NextResponse.json({ message: "Access Denied" }, { status: 403 });
    }

    try {
        const { userId, newRole } = await req.json();

        // Mencegah penurunan pangkat Super Admin (Optional safety)
        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        if (targetUser?.role === 'SUPER_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
             return NextResponse.json({ message: "Anda tidak bisa mengubah role Super Admin" }, { status: 403 });
        }

        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole }
        });

        return NextResponse.json({ status: "ok", message: "Role berhasil diupdate" });
    } catch (error) {
        return NextResponse.json({ message: "Gagal update" }, { status: 500 });
    }
}