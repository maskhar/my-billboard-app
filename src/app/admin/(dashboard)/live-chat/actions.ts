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

export async function getChatSessions() {
  await pastikanBolehLihatChat();

  try {
    const sessions = await prisma.chatSession.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Hanya ambil pesan terakhir untuk preview
        },
      },
    });
    return sessions;
  } catch (error) {
    console.error("Failed to fetch chat sessions:", error);
    return []; // Kembalikan array kosong jika terjadi error
  }
}

export async function getMessagesForSession(sessionId: string) {
  await pastikanBolehLihatChat();

  if (!sessionId) return null;

  try {
    const sessionWithMessages = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return sessionWithMessages;
  } catch (error) {
    console.error(`Failed to fetch messages for session ${sessionId}:`, error);
    return null;
  }
}
