// backend/src/chat/chat.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async createSession(data: { name: string; email: string; phone: string }) {
    return this.prisma.chatSession.create({
      data: {
        guestName: data.name,
        guestEmail: data.email,
        guestPhone: data.phone,
      },
    });
  }
}
