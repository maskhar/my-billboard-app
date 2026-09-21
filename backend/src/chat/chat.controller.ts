// backend/src/chat/chat.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('start')
  create(@Body() createChatDto: { name: string; email: string; phone: string }) {
    return this.chatService.createSession(createChatDto);
  }
}
