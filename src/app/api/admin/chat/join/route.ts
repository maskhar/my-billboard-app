import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const { sessionId } = await req.json();

    // Ubah status jadi AGENT (Supaya Bot berhenti menjawab)
    await prisma.chatSession.update({
        where: { id: sessionId },
        data: { 
            status: 'AGENT', 
            updatedAt: new Date() // Biar naik ke atas di list
        }
    });

    // Kirim System Message bahwa Admin bergabung
    await prisma.chatMessage.create({
        data: {
            sessionId,
            sender: 'SYSTEM',
            message: '👤 Admin telah bergabung ke percakapan.'
        }
    });

    return NextResponse.json({ status: 'ok' });
}