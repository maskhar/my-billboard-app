// src/app/api/admin/chat/reply/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bacaBodyJson } from "@/lib/body-json";
import { idDariBody } from "@/lib/id-dari-body";
import { teksPesanChat } from "@/lib/pesan-chat";

// Peran yang boleh mengelola percakapan pelanggan.
const CHAT_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CS'];

export async function POST(req: Request) {
    // Endpoint ini menulis pesan dengan sender 'ADMIN'. Tanpa gate, siapa pun
    // bisa mengirim pesan yang tampil sebagai pesan resmi admin ke pelanggan.
    const session = await getServerSession(authOptions);
    if (!session || !CHAT_ROLES.includes(session.user.role)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Body dibaca lewat penjaga bersama. `await req.json()` di luar `try`
    // melempar untuk body yang bukan JSON, dan lemparan itu dijawab sebagai
    // kerusakan server alih-alih 400. Lihat `src/lib/body-json.ts`.
    const hasil = await bacaBodyJson(req, 'admin/chat/reply');
    if (!hasil.ok) return hasil.jawaban;

    const sessionId = idDariBody(hasil.body.sessionId);
    // Panjangnya ikut dibatasi: route ini dulu memeriksa tipe `message` tapi
    // tidak panjangnya, sementara `chat-server` memotong pada 4000 karakter.
    // Dua jalur yang menulis ke satu kolom yang sama dengan batas berbeda.
    const message = teksPesanChat(hasil.body.message);

    if (sessionId === null || message === null) {
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
