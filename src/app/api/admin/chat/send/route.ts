// src/app/api/admin/chat/send/route.ts
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
  // Handler ini berada di bawah /api/admin sehingga hanya boleh dipakai staf.
  // Tanpa gate, siapa pun bisa menyisipkan pesan atas nama pengunjung ke sesi
  // mana pun dan membuka kembali sesi yang sudah ditutup.
  const session = await getServerSession(authOptions);
  if (!session || !CHAT_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const hasil = await bacaBodyJson(req, 'admin/chat/send');
    if (!hasil.ok) return hasil.jawaban;

    // Tipe KEDUA bidangnya diperiksa, bukan hanya `sessionId`. Komentar di sini
    // dulu sudah menjelaskan kenapa pemeriksaan tipe dibutuhkan — objek selalu
    // truthy, jadi pemeriksaan keberadaan meloloskannya utuh — tapi penjelasan
    // itu hanya diterapkan pada `sessionId`. `message` tinggal `!message`,
    // sehingga `{"sessionId":"<sesi nyata>","message":{"a":1}}` lolos sampai ke
    // `chatMessage.create` pada kolom String dan jatuh sebagai 500 "Gagal
    // kirim" yang bisa dipicu siapa pun yang punya satu id sesi.
    const sessionId = idDariBody(hasil.body.sessionId);
    const message = teksPesanChat(hasil.body.message);

    if (sessionId === null || message === null) {
        return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
    }

    // 1. Cek Sesi Saat Ini Dulu
    const chatSession = await prisma.chatSession.findUnique({
        where: { id: sessionId }
    });

    if (!chatSession) {
        return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
    }

    // 2. Tentukan Status Baru
    // Kalau tadinya 'CLOSED', PAKSA ubah jadi 'OPEN' biar Admin notif
    // Kalau 'AGENT', tetap 'AGENT'. Kalau 'OPEN', tetap 'OPEN'.
    let newStatus = chatSession.status;
    if (chatSession.status === 'CLOSED') {
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
        //
        // `isOnline: true` DIHAPUS dari sini. Komentarnya dulu berbunyi "anggap
        // user online lagi", dan "anggap" adalah kata yang tepat: itu dugaan,
        // bukan pengukuran. Kehadiran sekarang diukur dari koneksi socket yang
        // sesungguhnya oleh `chat-server/kehadiran.js` — satu-satunya proses
        // yang memegang socket tamu dan karena itu satu-satunya yang tahu
        // jawabannya. Menulis `true` di sini akan menimpa pengukuran itu dengan
        // dugaan, dan tanda hijaunya tidak punya jalan untuk padam.
        prisma.chatSession.update({
            where: { id: sessionId },
            data: {
                status: newStatus,
                updatedAt: new Date() // Biar naik ke atas di list admin
            }
        })
    ]);

    // 4. Beri respon ke Client apakah harus dialihkan ke Admin atau Bot
    if (chatSession.status === 'AGENT') {
        return NextResponse.json({ status: 'sent_to_admin' });
    }

    // Default return saved, frontend akan lanjut panggil AI
    return NextResponse.json({ status: 'saved' });

  } catch (e) {
    console.error("Chat Send Error:", e);
    return NextResponse.json({ error: "Gagal kirim" }, { status: 500 });
  }
}
