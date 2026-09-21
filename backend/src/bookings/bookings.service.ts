
import { Injectable, BadRequestException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../lib/mail.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { SubmitDesignDto } from './dto/submit-design.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RequestRefundDto } from './dto/request-refund.dto';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async create(createBookingDto: CreateBookingDto, user: any) {
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Admin dilarang membuat pesanan.');
    }

    const {
      billboardId,
      duration,
      totalPrice,
      dpAmount,
      paymentType,
      designOption,
      startDateString,
    } = createBookingDto;

    const targetBillboard = await this.prisma.billboard.findUnique({
      where: { id: billboardId },
    });

    if (!targetBillboard || targetBillboard.status !== 'Available') {
      throw new BadRequestException('Billboard tidak tersedia.');
    }

    const startDate = new Date(startDateString);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + duration);

    try {
      const newBooking = await this.prisma.booking.create({
        data: {
          userId: user.id,
          billboardId,
          startDate,
          endDate,
          duration,
          totalPrice,
          dpAmount: paymentType === 'dp' ? dpAmount : 0,
          status: 'PENDING_PAYMENT',
          designOption,
        },
      });

      if (user.email) {
        await this.mailService.sendEmail({
          to: user.email,
          subject: `Tagihan Order #${newBooking.id.slice(-6).toUpperCase()}`,
          title: 'Pesanan Diterima',
          message: `Halo ${user.name}, pesanan Anda telah kami terima.`,
          orderDetail: {
            id: newBooking.id,
            billboardTitle: targetBillboard.title,
            billboardAddress: targetBillboard.address,
            duration: duration,
            total: totalPrice,
            status: 'PENDING_PAYMENT',
          },
        });
      }

      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await this.mailService.sendEmail({
          to: adminEmail,
          subject: `[ADMIN] Order Masuk: ${targetBillboard.title}`,
          title: 'Ada Cuan Masuk! 💰',
          message: `User ${user.name} baru saja membuat pesanan. Mohon cek dashboard.`,
          orderDetail: {
            id: newBooking.id,
            billboardTitle: targetBillboard.title,
            billboardAddress: targetBillboard.address,
            duration: duration,
            total: totalPrice,
            status: 'PENDING_VERIFICATION',
          },
        });
      }

      return { message: 'Sukses', orderId: newBooking.id };
    } catch (error) {
      console.error('🔥 Server Error:', error);
      throw new InternalServerErrorException('Error Server');
    }
  }

  async submitDesign(submitDesignDto: SubmitDesignDto) {
    const { orderId, designUrl } = submitDesignDto;

    try {
      await this.prisma.booking.update({
        where: { id: orderId },
        data: {
          designFileUrl: designUrl,
          status: 'DESIGN_RECEIVED',
        },
      });
      return { message: 'Desain Berhasil Dikirim' };
    } catch (error) {
      throw new InternalServerErrorException('Gagal');
    }
  }

  async cancel(cancelBookingDto: CancelBookingDto) {
    const { orderId } = cancelBookingDto;

    try {
      const order = await this.prisma.booking.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
        include: { billboard: true, user: true },
      });

      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await this.mailService.sendEmail({
          to: adminEmail,
          subject: `🚫 Order Dibatalkan User: #${order.id.slice(-6).toUpperCase()}`,
          title: 'Pesanan Batal',
          message: `User <b>${order.user.name}</b> membatalkan pesanan (Fase Pending) untuk billboard <b>${order.billboard.title}</b>.`,
          orderDetail: {
            id: order.id,
            total: order.totalPrice,
            status: 'CANCELLED',
            billboardTitle: order.billboard.title,
            billboardAddress: order.billboard.address,
            duration: order.duration,
          },
        });
      }

      return { message: 'Pesanan dibatalkan' };
    } catch (error) {
      throw new InternalServerErrorException('Gagal membatalkan');
    }
  }

  async requestRefund(requestRefundDto: RequestRefundDto) {
    const { step, orderId, reason, bankName, bankAccount } = requestRefundDto;
    const adminEmail = process.env.ADMIN_EMAIL;

    if (step === 'reason') {
      const order = await this.prisma.booking.update({
        where: { id: orderId },
        data: {
          status: 'REVIEW_REFUND',
          cancelReason: reason,
        },
        include: { billboard: true, user: true },
      });

      if (adminEmail) {
        await this.mailService.sendEmail({
          to: adminEmail,
          subject: `⚠️ Permintaan Refund: #${order.id.slice(-6).toUpperCase()}`,
          title: 'User Minta Batal',
          message: `User <b>${order.user.name}</b> mengajukan pembatalan untuk billboard <b>${order.billboard.title}</b>.<br/>Alasan: "${reason}"`,
          orderDetail: {
            id: order.id,
            total: order.totalPrice,
            status: 'REVIEW REFUND',
            billboardTitle: order.billboard.title,
            billboardAddress: order.billboard.address,
            duration: order.duration,
          },
        });
      }
      return { message: 'Alasan dikirim' };
    }

    if (step === 'bank') {
      const orderData = await this.prisma.booking.findUnique({ where: { id: orderId } });
      const refundNominal = (orderData?.totalPrice || 0) * 0.9;

      const order = await this.prisma.booking.update({
        where: { id: orderId },
        data: {
          status: 'PROCESS_REFUND',
          userBankName: bankName,
          userBankAccount: bankAccount,
          refundAmount: refundNominal,
        },
        include: { billboard: true, user: true },
      });

      if (adminEmail) {
        await this.mailService.sendEmail({
          to: adminEmail,
          subject: `💰 Segera Proses Transfer: #${order.id.slice(-6).toUpperCase()}`,
          title: 'Data Rekening Masuk',
          message: `User telah memasukkan data rekening. Mohon segera transfer pengembalian dana Rp ${refundNominal.toLocaleString(
            'id-ID',
          )}.<br/>Bank: ${bankName} - ${bankAccount}`,
          orderDetail: {
            id: order.id,
            total: refundNominal,
            status: 'PROCESS REFUND',
            billboardTitle: order.billboard.title,
            billboardAddress: order.billboard.address,
            duration: order.duration,
          },
        });
      }
      return { message: 'Rekening disimpan' };
    }

    throw new BadRequestException('Invalid step');
  }
}
