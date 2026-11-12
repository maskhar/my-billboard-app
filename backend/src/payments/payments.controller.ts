
import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentsService } from './payments.service';
import { PaymentNotificationDto } from './dto/payment-notification.dto';
import { Public } from '../auth/public.decorator';

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Webhook payment gateway tidak punya session NextAuth, jadi harus publik.
  // Keamanannya bertumpu pada verifikasi secret header di bawah.
  @Public()
  @Post('notify')
  notify(
    @Body() paymentNotificationDto: PaymentNotificationDto,
    @Headers('x-webhook-secret') headerSecret?: string,
  ) {
    // NOTE: Ini proteksi sementara untuk development (webhook simulasi Xendit).
    // Saat integrasi payment gateway sungguhan, ganti dengan signature verification
    // asli dari Xendit (mis. verifikasi header x-callback-token / signature HMAC).
    //
    // Secret HANYA boleh masuk lewat header x-webhook-secret (dibaca dari server
    // Next.js via src/app/api/payment/notify/route.ts). Jalur lewat body sengaja
    // dihapus supaya secret tidak pernah ter-expose di log.
    const expected = process.env.PAYMENT_WEBHOOK_SECRET;

    if (!expected) {
      throw new UnauthorizedException('PAYMENT_WEBHOOK_SECRET belum dikonfigurasi di server.');
    }

    if (!headerSecret || !this.safeEqual(String(headerSecret), expected)) {
      throw new UnauthorizedException('Webhook secret tidak valid.');
    }

    return this.paymentsService.handlePaymentNotification(paymentNotificationDto);
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(aBuffer, bBuffer);
  }
}
