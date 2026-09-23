// src/app/api/admin/chat/reply/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Peran yang boleh mengelola percakapan pelanggan.
const CHAT_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CS'];

export async function POST(req: Request) {
    // Endpoint ini menulis pesan dengan sender 'ADMIN'. Tanpa gate, siapa pun
    // bisa mengirim pesan yang tampil sebagai pesan resmi admin ke pelanggan.
    const session = await getServerSession(authOptions);
    if (!session || !CHAT_ROLES.includes(session.user.role)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId, message } = await req.json();

    if (!sessionId || typeof sessionId !== 'string' || !message || typeof message !== 'string') {
        return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
    }

    // Kedua penulisan dalam satu transaksi (task 3.17). Pesan admin yang
    // tersimpan tanpa perubahan status membuat bot ikut menjawab di atas
    // jawaban admin — dua suara berbeda dalam satu percakapan, dan pelanggan
    // tidak bisa tahu mana yang mengikat.
    await prisma.$transaction(async (tx) => {
        // 1. Simpan Pesan Admin
        await tx.chatMessage.create({
            data: { sessionId, sender: 'ADMIN', message }
        });

        // 2. Ubah Status Session jadi AGENT (Supaya Bot berhenti ikut campur)
        await tx.chatSession.update({
            where: { id: sessionId },
            data: { status: 'AGENT', updatedAt: new Date() }
        });
    });

    return NextResponse.json({ status: 'ok' });
}
