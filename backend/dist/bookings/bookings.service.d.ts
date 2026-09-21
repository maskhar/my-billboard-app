import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../lib/mail.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { SubmitDesignDto } from './dto/submit-design.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RequestRefundDto } from './dto/request-refund.dto';
export declare class BookingsService {
    private prisma;
    private mailService;
    constructor(prisma: PrismaService, mailService: MailService);
    create(createBookingDto: CreateBookingDto, user: any): Promise<{
        message: string;
        orderId: string;
    }>;
    submitDesign(submitDesignDto: SubmitDesignDto): Promise<{
        message: string;
    }>;
    cancel(cancelBookingDto: CancelBookingDto): Promise<{
        message: string;
    }>;
    requestRefund(requestRefundDto: RequestRefundDto): Promise<{
        message: string;
    }>;
}
