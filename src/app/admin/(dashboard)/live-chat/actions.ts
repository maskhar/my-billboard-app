'use server';

import { prisma } from '@/lib/prisma';

export async function getChatSessions() {
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
