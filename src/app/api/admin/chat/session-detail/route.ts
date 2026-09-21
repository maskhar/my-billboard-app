import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if(!id) return NextResponse.json(null);

    const session = await prisma.chatSession.findUnique({
        where: { id: id }
    });

    return NextResponse.json(session);
}