// src/app/api/admin/chat/close/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bacaBodyJson } from "@/lib/body-json";
import { idDariBody } from "@/lib/id-dari-body";

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

    // `await req.json()` dulu dipanggil langsung di sini, tanpa penangkap. Body
    // yang bukan JSON melempar tanpa ada yang menahannya: Next menjawabnya
    // sebagai galat runtime, bukan 400, dan jejaknya masuk log sebagai
    // kerusakan server. Lihat `src/lib/body-json.ts`.
    const hasil = await bacaBodyJson(req, 'admin/chat/close');
    if (!hasil.ok) return hasil.jawaban;

    const sessionId = idDariBody(hasil.body.sessionId);
    if (sessionId === null) {
        return NextResponse.json({ error: "sessionId wajib diisi" }, { status: 400 });
    }

    // Kedua penulisan dalam satu transaksi (task 3.17). Sesi yang tertutup
    // tanpa pesan penutup meninggalkan pelanggan menunggu jawaban yang tidak
    // akan pernah datang, dan pesan penutup tanpa penutupan sesi membuat
    // percakapan tampak selesai padahal masih terbuka di panel admin.
    await prisma.$transaction(async (tx) => {
        // `isOnline: false` DIHAPUS dari sini. Petugas yang menutup percakapan
        // tidak memberi tahu apa pun tentang tamunya: orang itu bisa saja masih
        // menatap widget-nya, dan menandainya pergi membuat petugas berikutnya
        // yang membuka percakapan ini melihat keterangan yang salah. Kehadiran
        // diukur dari koneksi socket oleh `chat-server/kehadiran.js`; status
        // percakapan dan kehadiran tamu adalah dua hal berbeda, dan hanya yang
        // pertama yang diputuskan di sini.
        await tx.chatSession.update({
            where: { id: sessionId },
            data: { status: 'CLOSED' }
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
