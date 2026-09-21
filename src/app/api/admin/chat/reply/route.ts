// src/app/api/admin/chat/reply/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const { sessionId, message } = await req.json();

    // 1. Simpan Pesan Admin
    await prisma.chatMessage.create({
        data: { sessionId, sender: 'ADMIN', message }
    });

    // 2. Ubah Status Session jadi AGENT (Supaya Bot berhenti ikut campur)
    await prisma.chatSession.update({
        where: { id: sessionId },
        data: { status: 'AGENT', updatedAt: new Date() }
    });

    return NextResponse.json({ status: 'ok' });
}