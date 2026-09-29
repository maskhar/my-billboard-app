// src/app/api/admin/billboards/detail/route.ts
//
// Sebelumnya tanpa autentikasi: siapa pun bisa membaca billboard berstatus
// DRAFT (belum publik), dan `include: { changedBy: true }` ikut mengirim
// seluruh baris User — termasuk email admin dan hash password-nya.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { peranBoleh, PERAN_PEMBACA_PANEL } from '@/lib/gerbang-peran';


export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !peranBoleh(PERAN_PEMBACA_PANEL, session.user.role)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json(null);

  const billboard = await prisma.billboard.findUnique({
    where: { id: id },
    include: {
      history: {
        orderBy: { archivedAt: 'desc' },
        take: 10,
        include: {
          // Select eksplisit: cukup nama untuk jejak audit, email admin
          // tidak perlu dikirim ke browser.
          changedBy: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  return NextResponse.json(billboard);
}
