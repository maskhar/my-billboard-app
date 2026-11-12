
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../lib/mail.service';
import { PaymentNotificationDto } from './dto/payment-notification.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async handlePaymentNotification(paymentNotificationDto: PaymentNotificationDto) {
    const { orderId } = paymentNotificationDto;
    console.log('💰 [NOTIFY] Menerima sinyal bayar untuk order:', orderId);

    const order = await this.prisma.booking.findUnique({
      where: { id: orderId },
      include: { user: true, billboard: true },
    });

    if (!order) {
      console.error('❌ Order tidak ditemukan!');
      throw new NotFoundException('Order not found');
    }

    const nextStatus = order.designOption === 'service' ? 'IN_PRODUCTION' : 'DESIGN_RECEIVED';

    try {
      await this.prisma.booking.update({
        where: { id: orderId },
        data: {
          status: nextStatus,
          paidAt: new Date(),
        },
      });
      console.log(`✅ Status Updated: ${nextStatus} & Waktu bayar dicatat`);

      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await this.mailService.sendEmail({
          to: adminEmail,
          subject: `[LUNAS] Uang Masuk: Rp ${order.totalPrice.toLocaleString('id-ID')}`,
          title: 'Ada Pembayaran Masuk! 💰',
          message: `User <b>${order.user.name}</b> sudah membayar lunas. Total: Rp ${order.totalPrice.toLocaleString(
            'id-ID',
          )}.<br/>Segera cek dashboard dan Klik Terima.`,
          orderDetail: {
            id: order.id,
            billboardTitle: order.billboard.title,
            billboardAddress: order.billboard.address,
            duration: order.duration,
            total: order.totalPrice,
            status: 'MENUNGGU VERIFIKASI ADMIN',
          },
        });
      }

      if (order.user.email) {
        await this.mailService.sendEmail({
          to: order.user.email,
          subject: `Pembayaran Berhasil! Order #${order.id.slice(-6).toUpperCase()}`,
          title: 'Dana Telah Diterima',
          message: `Terima kasih! Dana sebesar Rp ${order.totalPrice.toLocaleString(
            'id-ID',
          )} sudah masuk ke sistem kami. Tim Admin akan memverifikasi dalam waktu singkat.`,
          orderDetail: {
            id: order.id,
            billboardTitle: order.billboard.title,
            billboardAddress: order.billboard.address,
            duration: order.duration,
            total: order.totalPrice,
            status: 'SEDANG DIVERIFIKASI',
          },
        });
        console.log('📨 Konfirmasi terkirim ke User:', order.user.email);
      }

      return { status: 'ok' };
    } catch (error: any) {
      console.error('🔥 Server Error (Notify):', error.message);
      throw new InternalServerErrorException('Server Error');
    }
  }
}
