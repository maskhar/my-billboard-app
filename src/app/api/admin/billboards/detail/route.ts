import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json(null);

  const billboard = await prisma.billboard.findUnique({
      where: { id: id },
      include: {
          history: {
            orderBy: { archivedAt: 'desc' },
            take: 10,
            include: { changedBy: true }
          }
      }
  });

  return NextResponse.json(billboard);
}