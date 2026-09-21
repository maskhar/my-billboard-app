import { PrismaService } from '../prisma/prisma.service';
export declare class ChatService {
    private prisma;
    constructor(prisma: PrismaService);
    createSession(data: {
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
