// src/app/api/admin/chat/suggest/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { dekripsi } from "@/lib/rahasia";
import { bacaBodyJson } from "@/lib/body-json";
import { peranBoleh, PERAN_CHAT } from "@/lib/gerbang-peran";

// Peran yang boleh memakai bantuan AI di inbox percakapan.

// Tiap panggilan endpoint ini meneruskan permintaan ke Gemini API dan
// menghabiskan kuota berbayar. Batas dipasang per pengguna, bukan per IP,
// karena IP mudah dipalsukan lewat header proxy.
const AI_LIMIT = 20;
const AI_WINDOW_MS = 60 * 1000; // 20 permintaan per menit per akun

export async function POST(req: Request) {
    try {
        // Sebelumnya endpoint ini tidak punya autentikasi sama sekali. Karena
        // ia memanggil Gemini API dengan key milik perusahaan, orang luar bisa
        // menguras kuota berbayar sekaligus membaca isi percakapan pelanggan
        // lewat konteks yang dikembalikan.
        const session = await getServerSession(authOptions);
        if (!session || !peranBoleh(PERAN_CHAT, session.user.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const limitResult = rateLimit({
            key: `chat-suggest:${session.user.id}`,
            limit: AI_LIMIT,
            windowMs: AI_WINDOW_MS,
        });

        if (!limitResult.success) {
            return NextResponse.json(
                { reply: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
                { status: 429, headers: rateLimitHeaders(AI_LIMIT, limitResult) }
            );
        }

        const hasilBody = await bacaBodyJson(req, 'admin/chat/suggest');
        if (!hasilBody.ok) return hasilBody.jawaban;
        const { sessionId, context } = hasilBody.body;

        if (!sessionId || typeof sessionId !== 'string') {
            return NextResponse.json({ error: "sessionId wajib diisi" }, { status: 400 });
        }

        // 1. Ambil Setting API Key
        //
        // Kolom ini tersimpan terenkripsi (lihat `src/lib/rahasia.ts`), jadi
        // isinya harus dibuka dulu sebelum dikirim ke Google. Memakai nilai
        // mentahnya berarti mengirim ciphertext sebagai kunci, dan yang
        // kembali adalah 400 dari pihak ketiga yang tidak menjelaskan apa pun.
        const setting = await prisma.systemSetting.findUnique({
            where: { id: "default_config" },
            select: { geminiApiKey: true },
        });
        const geminiApiKey = dekripsi(setting?.geminiApiKey);
        if (!geminiApiKey) return NextResponse.json({ reply: "Err: API Key Missing" });

        // 2. Ambil 10 History Terakhir untuk konteks
        const histories = await prisma.chatMessage.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        // Format history menjadi teks dialog
        const conversation = histories.reverse().map(m => `${m.sender}: ${m.message}`).join("\n");

        // 3. Prompt ke AI
        const prompt = `
            Kamu adalah asisten CS senior. Bantu Admin membalas pesan user.
            KONTEKS PERCAKAPAN:
            ${conversation}

            PERINTAH ADMIN (Opsional): ${context || "Buatkan balasan yang ramah dan solutif"}

            Tuliskan 1 draft balasan saja yang profesional, singkat, dan persuasif. Tidak usah pakai tanda kutip.
        `;

        // API key dikirim lewat header `x-goog-api-key`, bukan query string.
        // Key di query string ikut tercatat di log server, log proxy perantara,
        // dan header Referer — praktis bocor tanpa disadari.
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };

        const aiRes = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': geminiApiKey,
            },
            body: JSON.stringify(payload)
        });
        // Balasan Gemini diperiksa dua kali, dan keduanya menutup cacat nyata:
        //
        //   1. `aiRes.ok` dulu tidak diperiksa. Key kedaluwarsa (403), kuota
        //      habis (429), dan prompt yang diblokir filter keamanan semuanya
        //      memulangkan badan JSON TANPA `candidates`, jadi rantai `?.` di
        //      bawah bernilai `undefined` dan admin menerima 200 berisi
        //      `{ reply: undefined }` — kotak draft terbuka kosong tanpa satu
        //      pun tanda bahwa AI-nya menolak. Sebabnya dicatat di log server
        //      (status saja, bukan badan balasan: badan itu memuat kembali
        //      prompt beserta isi percakapan pelanggan).
        //   2. `await aiRes.json()` tanpa penjaga. Balasan 502 dari perantara
        //      berbadan HTML membuatnya melempar, dan lemparannya dulu mendarat
        //      di `catch` yang membuang galatnya.
        if (!aiRes.ok) {
            console.error('Gemini menolak permintaan draft:', aiRes.status);
            return NextResponse.json(
                { reply: "Maaf, AI sedang sibuk." },
                { headers: rateLimitHeaders(AI_LIMIT, limitResult) }
            );
        }

        const aiData = await aiRes.json().catch((galat: unknown) => {
            console.error('Balasan Gemini bukan JSON:', galat);
            return null;
        });

        const draft = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        return NextResponse.json(
            {
                reply: typeof draft === 'string' && draft.trim() !== ''
                    ? draft
                    : "AI tidak menghasilkan draft kali ini. Coba ulangi.",
            },
            { headers: rateLimitHeaders(AI_LIMIT, limitResult) }
        );

    } catch (galat) {
        // `catch (e)` dulu membuang galatnya tanpa sepatah pun di log, jadi
        // kegagalan `req.json()`, `dekripsi()` yang menolak kunci rusak, dan
        // jaringan yang mati semuanya terbaca sama bagi admin DAN sama bagi
        // siapa pun yang membaca log server.
        console.error('Gagal menyusun draft balasan AI:', galat);
        return NextResponse.json({ reply: "Maaf, AI sedang sibuk." });
    }
}
