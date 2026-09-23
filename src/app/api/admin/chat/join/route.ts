// src/app/api/admin/chat/join/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Peran yang boleh mengelola percakapan pelanggan.
const CHAT_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CS'];

export async function POST(req: Request) {
    // Tanpa gate ini, orang luar bisa mengambil alih percakapan pelanggan dan
    // menyamar sebagai admin di mata pengunjung.
    const session = await getServerSession(authOptions);
    if (!session || !CHAT_ROLES.includes(session.user.role)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await req.json();

    if (!sessionId || typeof sessionId !== 'string') {
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
