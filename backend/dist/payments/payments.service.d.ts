import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../lib/mail.service';
import { PaymentNotificationDto } from './dto/payment-notification.dto';
export declare class PaymentsService {
    private prisma;
    private mailService;
    constructor(prisma: PrismaService, mailService: MailService);
    handlePaymentNotification(paymentNotificationDto: PaymentNotificationDto): Promise<{
        status: string;
    }>;
}
