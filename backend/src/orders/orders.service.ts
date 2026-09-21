
import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../lib/mail.service';
import { UpdateOrderDto } from './dto/update-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async updateOrderStatus(updateOrderDto: UpdateOrderDto) {
    const { orderId, newStatus, reason, refundProof, installationProof, isLocked } = updateOrderDto;

    try {
      const updateData: any = {
        status: newStatus,
        ...(reason && { cancelReason: reason }),
        ...(refundProof && { refundProof: refundProof }),
        ...(installationProof && { installationProof: installationProof }),
        ...(isLocked !== undefined && { isLocked: isLocked }),
      };

      if (newStatus === 'REFUNDED') {
        const currentOrder = await this.prisma.booking.findUnique({ where: { id: orderId } });
        if (!currentOrder?.refundedAt) {
          updateData.refundedAt = new Date();
        }
      }

      const updatedOrder = await this.prisma.booking.update({
        where: { id: orderId },
        data: updateData,
        include: {
          user: true,
          billboard: true,
        },
      });

      if (updatedOrder && updatedOrder.user && updatedOrder.user.email) {
        let subject = '',
          title = '',
          message = '';

        if (newStatus === 'ACTIVE') {
          subject = `✅ Pembayaran Diterima - Order #${updatedOrder.id.slice(-6).toUpperCase()}`;
          title = 'Pembayaran Berhasil! Order Aktif.';
          message = `Halo ${updatedOrder.user.name}, pembayaran Anda telah kami terima. Billboard "${updatedOrder.billboard.title}" sekarang berstatus AKTIF dan siap tayang.`;
        } else if (newStatus === 'REFUNDED') {
          subject = '💰 Dana Refund Dikembalikan';
          title = 'Pengembalian Dana Selesai';
          message = `Halo ${updatedOrder.user.name}, Admin telah mentransfer pengembalian dana ke rekening Anda. Silakan cek bukti transfer di dashboard website.`;
        }

        if (subject) {
          await this.mailService.sendEmail({
            to: updatedOrder.user.email,
            subject: subject,
            title: title,
            message: message,
            orderDetail: {
              id: updatedOrder.id,
              billboardTitle: updatedOrder.billboard.title,
              billboardAddress: updatedOrder.billboard.address,
              duration: updatedOrder.duration,
              total: updatedOrder.totalPrice,
              status: newStatus,
            },
          });
        }
      }

      return { message: 'Update Sukses' };
    } catch (error) {
      console.error('Update Error:', error);
      throw new InternalServerErrorException('Gagal Update');
    }
  }
}
