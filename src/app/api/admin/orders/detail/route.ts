// src/app/api/admin/orders/detail/route.ts
//
// Route ini DIPANGGIL tapi tidak pernah ada (task 4.13). Akibatnya
// `admin/(dashboard)/orders/[id]/page.tsx:22` menerima 404, `setOrder` tidak
// pernah terisi, dan halaman detail order admin berhenti di "Loading..."
// selamanya — tidak ada pesan error, hanya diam.
//
// `select` sengaja dipersempit ke field yang benar-benar dirender halaman itu.
// Order memuat data pribadi pelanggan (email, whatsapp, alamat) dan nilai
// transaksi; tidak ada alasan mengirimkannya ke browser bila tidak ditampilkan.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ROLE_ADMIN = ['ADMIN', 'SUPER_ADMIN', 'OPERATOR'];

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !ROLE_ADMIN.includes(session.user.role)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id || typeof id !== 'string' || id.trim() === '') {
    return NextResponse.json({ message: 'Parameter id wajib diisi' }, { status: 400 });
  }

  const order = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      installationProof: true,
      // Dipakai halaman: order.user.name & order.billboard.title.
      user: {
        select: { id: true, name: true },
      },
      billboard: {
        select: { id: true, title: true },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ message: 'Order tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json(order);
}
