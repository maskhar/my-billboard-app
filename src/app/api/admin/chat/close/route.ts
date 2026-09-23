// src/app/api/admin/chat/close/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Peran yang boleh mengelola percakapan pelanggan.
const CHAT_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CS'];

export async function POST(req: Request) {
    // Sebelumnya handler ini tidak memeriksa sesi sama sekali: siapa pun bisa
    // menutup percakapan pelanggan mana pun hanya dengan menebak sessionId.
    // Middleware sudah menyaring di tingkat edge, tapi tiap route tetap wajib
    // memverifikasi sendiri (middleware bisa di-bypass bila matcher berubah).
    const session = await getServerSession(authOptions);
    if (!session || !CHAT_ROLES.includes(session.user.role)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await req.json();

    if (!sessionId || typeof sessionId !== 'string') {
        return NextResponse.json({ error: "sessionId wajib diisi" }, { status: 400 });
    }

    // Kedua penulisan dalam satu transaksi (task 3.17). Sesi yang tertutup
    // tanpa pesan penutup meninggalkan pelanggan menunggu jawaban yang tidak
    // akan pernah datang, dan pesan penutup tanpa penutupan sesi membuat
    // percakapan tampak selesai padahal masih terbuka di panel admin.
    await prisma.$transaction(async (tx) => {
        await tx.chatSession.update({
            where: { id: sessionId },
            data: { status: 'CLOSED', isOnline: false }
        });

        // PENGHALUSAN BAHASA DI SINI:
        await tx.chatMessage.create({
            data: {
                sessionId,
                sender: 'SYSTEM',
                message: '👋 Admin telah meninggalkan sesi percakapan. Terima kasih!'
            }
        });
    });

    return NextResponse.json({ status: 'ok' });
}
