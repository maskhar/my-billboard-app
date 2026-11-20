
import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../lib/mail.service';
import { UpdateOrderDto } from './dto/update-order.dto';

const VALID_ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID_CONFIRMED',
  'DESIGN_RECEIVED',
  'IN_PRODUCTION',
  'INSTALLATION',
  'ACTIVE',
  'WAITING_BANK',
  'REVIEW_REFUND',
  'PROCESS_REFUND',
  'REFUNDED',
  'CANCELLED',
] as const;

const TERMINAL_ORDER_STATUSES = ['CANCELLED', 'REFUNDED'] as const;

const ALLOWED_ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING_PAYMENT: ['CANCELLED', 'PAID_CONFIRMED', 'DESIGN_RECEIVED', 'IN_PRODUCTION'],
  PAID_CONFIRMED: ['CANCELLED', 'DESIGN_RECEIVED', 'IN_PRODUCTION', 'REVIEW_REFUND'],
  DESIGN_RECEIVED: ['IN_PRODUCTION', 'REVIEW_REFUND'],
  IN_PRODUCTION: ['INSTALLATION', 'REVIEW_REFUND'],
  INSTALLATION: ['ACTIVE', 'REVIEW_REFUND'],
  ACTIVE: ['WAITING_BANK', 'REVIEW_REFUND'],
  WAITING_BANK: ['PROCESS_REFUND'],
  REVIEW_REFUND: ['WAITING_BANK', 'ACTIVE'],
  PROCESS_REFUND: ['REFUNDED'],
  REFUNDED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  // otorisasi admin ditangani RolesGuard lewat @Roles(...ADMIN_ROLES) di
  // controller. `adminEmail` di body masih diterima tapi diabaikan.
  private assertValidStatus(status: string) {
    if (!VALID_ORDER_STATUSES.includes(status as (typeof VALID_ORDER_STATUSES)[number])) {
      throw new BadRequestException(
        `Status order tidak valid. Gunakan salah satu: ${VALID_ORDER_STATUSES.join(', ')}.`,
      );
    }
  }

  private assertTransitionAllowed(currentStatus: string, nextStatus: string) {
    if (currentStatus === nextStatus) return;
    if (TERMINAL_ORDER_STATUSES.includes(currentStatus as (typeof TERMINAL_ORDER_STATUSES)[number])) {
      throw new BadRequestException('Status akhir (CANCELLED/REFUNDED) tidak dapat diubah lagi.');
    }
    const allowed = ALLOWED_ORDER_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Transisi status tidak diizinkan: ${currentStatus} -> ${nextStatus}.`,
      );
    }
  }

  async updateOrderStatus(updateOrderDto: UpdateOrderDto) {
    const { orderId, newStatus, reason, refundProof, installationProof, isLocked } = updateOrderDto;

    if (!orderId) {
      throw new BadRequestException('orderId wajib diisi.');
    }
    if (newStatus !== undefined && newStatus !== null) {
      this.assertValidStatus(String(newStatus));
    }

    try {
      const currentOrder = await this.prisma.booking.findUnique({ where: { id: orderId } });
      if (!currentOrder) {
        throw new NotFoundException('Pesanan tidak ditemukan.');
      }

      if (newStatus !== undefined && newStatus !== null) {
        this.assertTransitionAllowed(currentOrder.status, String(newStatus));
      }

      const updateData: any = {
        ...(newStatus !== undefined && newStatus !== null && { status: newStatus }),
        ...(reason && { cancelReason: reason }),
        ...(refundProof && { refundProof: refundProof }),
        ...(installationProof && { installationProof: installationProof }),
        ...(isLocked !== undefined && { isLocked: isLocked }),
      };

      if (newStatus === 'REFUNDED') {
        if (!currentOrder.refundedAt) {
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
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      console.error('Update Error:', error);
      throw new InternalServerErrorException('Gagal Update');
    }
  }
}
