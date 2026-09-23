// src/app/api/admin/chat/session-detail/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Peran yang boleh membaca data percakapan pelanggan.
const CHAT_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CS'];

export async function GET(req: Request) {
    // ChatSession memuat guestName, guestEmail, dan guestPhone. Tanpa gate,
    // identitas tiap pengunjung bisa diambil siapa pun yang tahu id sesinya.
    const session = await getServerSession(authOptions);
    if (!session || !CHAT_ROLES.includes(session.user.role)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if(!id) return NextResponse.json(null);

    const chatSession = await prisma.chatSession.findUnique({
        where: { id: id }
    });

    return NextResponse.json(chatSession);
}
