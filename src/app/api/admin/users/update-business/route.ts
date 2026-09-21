// src/app/api/admin/users/update-business/route.ts
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId, ...data } = await req.json();
    
    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });

    return NextResponse.json(user);
  } catch (error) {
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
