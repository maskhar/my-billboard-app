// src/app/api/admin/chat/join/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bacaBodyJson } from "@/lib/body-json";
import { idDariBody } from "@/lib/id-dari-body";
import { peranBoleh, PERAN_CHAT } from "@/lib/gerbang-peran";

// Peran yang boleh mengelola percakapan pelanggan.

export async function POST(req: Request) {
    // Tanpa gate ini, orang luar bisa mengambil alih percakapan pelanggan dan
    // menyamar sebagai admin di mata pengunjung.
    const session = await getServerSession(authOptions);
    if (!session || !peranBoleh(PERAN_CHAT, session.user.role)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Body dibaca lewat penjaga bersama: `await req.json()` di luar `try`
    // melempar untuk body yang bukan JSON, dan lemparan itu dijawab sebagai
    // kerusakan server alih-alih 400. Lihat `src/lib/body-json.ts`.
    const hasil = await bacaBodyJson(req, 'admin/chat/join');
    if (!hasil.ok) return hasil.jawaban;

    const sessionId = idDariBody(hasil.body.sessionId);
    if (sessionId === null) {
        return NextResponse.json({ error: "sessionId wajib diisi" }, { status: 400 });
    }

    // Kedua penulisan dalam satu transaksi (task 3.17).
    //
    // Bila status sudah berubah menjadi AGENT tetapi pesan sistemnya gagal
    // tertulis, bot berhenti menjawab sementara pelanggan tidak pernah
    // diberi tahu bahwa ada manusia yang masuk — percakapan tampak mati
    // begitu saja. Urutan sebaliknya sama buruknya: pelanggan membaca
    // "Admin telah bergabung" padahal bot masih yang menjawab.
    await prisma.$transaction(async (tx) => {
        // Ubah status jadi AGENT (Supaya Bot berhenti menjawab)
        await tx.chatSession.update({
            where: { id: sessionId },
            data: {
                status: 'AGENT',
                updatedAt: new Date() // Biar naik ke atas di list
            }
        });

        // Kirim System Message bahwa Admin bergabung
        await tx.chatMessage.create({
            data: {
                sessionId,
                sender: 'SYSTEM',
                message: '👤 Admin telah bergabung ke percakapan.'
            }
        });
    });

    return NextResponse.json({ status: 'ok' });
}
