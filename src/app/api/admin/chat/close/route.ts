import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const { sessionId } = await req.json();

    await prisma.chatSession.update({
        where: { id: sessionId },
        data: { status: 'CLOSED', isOnline: false }
    });

    // PENGHALUSAN BAHASA DI SINI:
    await prisma.chatMessage.create({
        data: {
            sessionId,
            sender: 'SYSTEM',
            message: '👋 Admin telah meninggalkan sesi percakapan. Terima kasih!'
        }
    });

    return NextResponse.json({ status: 'ok' });
}