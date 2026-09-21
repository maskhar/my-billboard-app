import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../lib/mail.service';
import { UpdateOrderDto } from './dto/update-order.dto';
export declare class OrdersService {
    private prisma;
    private mailService;
    constructor(prisma: PrismaService, mailService: MailService);
    updateOrderStatus(updateOrderDto: UpdateOrderDto): Promise<{
        message: string;
    }>;
}
