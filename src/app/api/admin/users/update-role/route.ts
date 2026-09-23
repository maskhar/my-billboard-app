// src/app/api/admin/users/update-role/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, daftarNilai, sahRole } from "@/lib/enum-guard";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    // Cek Keamanan: Hanya Admin/SuperAdmin yang boleh akses
    if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
        return NextResponse.json({ message: "Access Denied" }, { status: 403 });
    }

    try {
        const { userId, newRole } = await req.json();

        if (!userId) {
            return NextResponse.json({ message: "userId dibutuhkan" }, { status: 400 });
        }

        // Ini satu-satunya jalur yang bisa mengubah role akun, dan dulu
        // nilainya masuk ke database tanpa diperiksa sama sekali. Salah ketik
        // "ADMlN" (huruf L, bukan I) akan tersimpan dan membuat pemiliknya
        // terkunci dari seluruh dashboard tanpa pesan apa pun.
        if (!sahRole(newRole)) {
            return NextResponse.json(
                { message: `Role tidak valid. Nilai yang sah: ${daftarNilai(Role)}` },
                { status: 400 }
            );
        }

        // Mencegah penurunan pangkat Super Admin (Optional safety)
        const targetUser = await prisma.user.findUnique({ where: { id: userId } });

        if (!targetUser) {
            return NextResponse.json({ message: "User tidak ditemukan" }, { status: 404 });
        }

        if (targetUser.role === 'SUPER_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
             return NextResponse.json({ message: "Anda tidak bisa mengubah role Super Admin" }, { status: 403 });
        }

        // Hanya SUPER_ADMIN yang boleh mengangkat orang lain jadi SUPER_ADMIN.
        // Tanpa ini, seorang ADMIN bisa mengangkat dirinya lewat akun kedua
        // lalu memakai akun itu untuk hal-hal yang tertutup baginya.
        if (newRole === 'SUPER_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
            return NextResponse.json(
                { message: "Hanya Super Admin yang bisa mengangkat Super Admin baru" },
                { status: 403 }
            );
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