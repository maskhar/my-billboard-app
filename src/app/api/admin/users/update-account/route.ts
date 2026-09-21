// src/app/api/admin/users/update-account/route.ts
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { userId, password, ...data } = await req.json();
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      data.password = hashedPassword;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });

    return NextResponse.json(user);
  } catch (error) {
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
