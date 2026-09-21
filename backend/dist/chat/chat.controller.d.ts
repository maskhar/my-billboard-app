import { ChatService } from './chat.service';
export declare class ChatController {
    private readonly chatService;
    constructor(chatService: ChatService);
    create(createChatDto: {
        name: string;
        email: string;
        phone: string;
    }): Promise<{
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        guestName: string;
        guestEmail: string;
        guestPhone: string;
        isOnline: boolean;
    }>;
}
