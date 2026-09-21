
import { Controller, Post, Body } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentNotificationDto } from './dto/payment-notification.dto';

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('notify')
  notify(@Body() paymentNotificationDto: PaymentNotificationDto) {
    return this.paymentsService.handlePaymentNotification(paymentNotificationDto);
  }
}
