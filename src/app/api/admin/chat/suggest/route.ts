// src/app/api/admin/chat/suggest/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const { sessionId, context } = await req.json();

        // 1. Ambil Setting API Key
        const setting = await prisma.systemSetting.findUnique({ where: { id: "default_config" } });
        if (!setting?.geminiApiKey) return NextResponse.json({ reply: "Err: API Key Missing" });

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

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${setting.geminiApiKey}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };

        const aiRes = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        const aiData = await aiRes.json();
        
        return NextResponse.json({ reply: aiData.candidates?.[0]?.content?.parts?.[0]?.text });

    } catch (e) {
        return NextResponse.json({ reply: "Maaf, AI sedang sibuk." });
    }
}