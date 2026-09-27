// src/app/admin/(dashboard)/live-chat/actions.ts
'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Peran yang boleh membaca percakapan pelanggan.
const CHAT_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CS'];

// Penjaga akses untuk Server Action.
//
// Server Action di Next.js adalah endpoint HTTP publik dengan id yang bisa
// ditemukan dari bundle JavaScript — bukan fungsi internal. Kedua action di
// file ini mengembalikan guestName, guestEmail, guestPhone, dan seluruh isi
// percakapan, jadi tanpa pemeriksaan ini data pelanggan bisa diambil siapa pun
// yang memanggil endpoint action-nya langsung.
async function pastikanBolehLihatChat() {
  const session = await getServerSession(authOptions);
  if (!session || !CHAT_ROLES.includes(session.user.role)) {
    throw new Error('Unauthorized');
  }
}

// `catch` yang mengembalikan `[]` DIHAPUS.
//
// Pemanggilnya adalah Server Component (`live-chat/page.tsx`), yang meneruskan
// hasilnya langsung ke `CS_InboxLayout`. Daftar kosong di sana dirender sebagai
// kotak masuk yang bersih — tidak ada percakapan yang menunggu. Itu persis
// kalimat yang tidak boleh diucapkan saat database gagal dihubungi: CS melihat
// layar tenang, tidak menjawab siapa pun, dan pelanggan yang sedang mengetik di
// widget chat tidak pernah dibalas. Galat sekarang melempar ke
// `admin/(dashboard)/error.tsx`, yang menyatakan datanya gagal dimuat.
export async function getChatSessions() {
  await pastikanBolehLihatChat();

  return await prisma.chatSession.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1, // Hanya ambil pesan terakhir untuk preview
      },
    },
  });
}

export async function getMessagesForSession(sessionId: string) {
  await pastikanBolehLihatChat();

  if (!sessionId) return null;

  // `catch` yang mengembalikan `null` DIHAPUS di sini juga. Pemanggilnya
  // (`CS_InboxLayout.handleSelectSession`) menulis `fullSession?.messages || []`,
  // jadi `null` menjadi percakapan yang tampil KOSONG — bukan gagal. CS membuka
  // percakapan pelanggan, melihat riwayatnya lenyap, dan menjawab tanpa tahu apa
  // yang sudah dibicarakan sebelumnya.
  //
  // `null` tetap dipakai untuk satu arti saja: sesi dengan id itu tidak ada.
  // Pemanggil sekarang menangkap galat dan menampilkannya (lihat try/catch di
  // sana), karena ini Client Component — melempar ke batas galat akan
  // membongkar seluruh kotak masuk hanya karena satu percakapan gagal dibuka.
  return await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}
