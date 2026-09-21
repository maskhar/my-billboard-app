import { PaymentsService } from './payments.service';
import { PaymentNotificationDto } from './dto/payment-notification.dto';
export declare class PaymentsController {
    private readonly paymentsService;
    constructor(paymentsService: PaymentsService);
    notify(paymentNotificationDto: PaymentNotificationDto): Promise<{
        status: string;
    }>;
}
