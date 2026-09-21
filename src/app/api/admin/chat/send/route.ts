// src/app/api/chat/send/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { sessionId, message } = await req.json();

    if (!sessionId || !message) {
        return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
    }

    // 1. Cek Sesi Saat Ini Dulu
    const session = await prisma.chatSession.findUnique({ 
        where: { id: sessionId } 
    });

    if (!session) {
        return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
    }

    // 2. Tentukan Status Baru
    // Kalau tadinya 'CLOSED', PAKSA ubah jadi 'OPEN' biar Admin notif
    // Kalau 'AGENT', tetap 'AGENT'. Kalau 'OPEN', tetap 'OPEN'.
    let newStatus = session.status;
    if (session.status === 'CLOSED') {
        newStatus = 'OPEN';
        console.log(`♻️ RE-OPENING Session: ${sessionId}`); // Debug Log
    }

    // 3. Simpan Pesan User & Update Status Session SEKALIGUS (Transaction)
    // Kita pakai transaction biar atomic (aman)
    await prisma.$transaction([
        // A. Insert Pesan
        prisma.chatMessage.create({
            data: { 
                sessionId, 
                sender: 'USER', 
                message 
            }
        }),
        // B. Update Sesi (Status & Waktu Terakhir)
        prisma.chatSession.update({
            where: { id: sessionId },
            data: { 
                status: newStatus,
                isOnline: true, // Anggap user online lagi
                updatedAt: new Date() // Biar naik ke atas di list admin
            }
        })
    ]);

    // 4. Beri respon ke Client apakah harus dialihkan ke Admin atau Bot
    if (session.status === 'AGENT') {
        return NextResponse.json({ status: 'sent_to_admin' });
    }

    // Default return saved, frontend akan lanjut panggil AI
    return NextResponse.json({ status: 'saved' });

  } catch (e) {
    console.error("Chat Send Error:", e);
    return NextResponse.json({ error: "Gagal kirim" }, { status: 500 });
  }
}