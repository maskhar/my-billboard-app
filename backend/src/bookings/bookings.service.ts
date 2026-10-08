
import { Injectable, BadRequestException, ConflictException, ForbiddenException, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../lib/mail.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { SubmitDesignDto } from './dto/submit-design.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RequestRefundDto } from './dto/request-refund.dto';

// Status yang TIDAK memblokir availability karena slot sudah dilepas secara
// terminal (user cancel / uang sudah kembali). Semua status lain — termasuk
// PENDING_PAYMENT, PAID_CONFIRMED, DESIGN_RECEIVED, IN_PRODUCTION,
// INSTALLATION, ACTIVE, dan status refund yang masih diproses — dianggap
// masih memegang billboard dan harus menolak booking baru yang overlap.
// Daftar ini disusun dari evidence codebase (lihat laporan Batch 3-B2) dan
// bersifat fail-closed: status baru yang belum dikenal ikut memblokir.
const NON_BLOCKING_BOOKING_STATUSES = ['CANCELLED', 'REFUNDED'];

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  /**
   * Pastikan order yang disentuh benar milik `actorId`. Tanpa cek ini, guard
   * global hanya membuktikan "seseorang sedang login", sehingga user A bisa
   * mengubah atau membatalkan order user B hanya dengan mengetahui orderId.
   */
  private async assertOrderOwner(orderId: string, actorId: string) {
    const order = await this.prisma.booking.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order) {
      throw new NotFoundException('Pesanan tidak ditemukan.');
    }
    if (order.userId !== actorId) {
      throw new ForbiddenException('Pesanan ini bukan milik Anda.');
    }
  }

  async create(createBookingDto: CreateBookingDto, userId: string) {
    if (!userId) {
      throw new UnauthorizedException('Sesi tidak valid. Silakan login ulang.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User tidak ditemukan di database.');
    }

    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Admin dilarang membuat pesanan.');
    }

    const {
      billboardId,
      duration,
      paymentType,
      designOption,
      startDateString,
    } = createBookingDto;

    // `duration` harus bilangan bulat positif. Client bisa mengirim negatif,
    // nol, pecahan, atau nilai non-numeric; semuanya harus ditolak dengan 400.
    if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1) {
      throw new BadRequestException('Durasi sewa tidak valid. Harus bilangan bulat minimal 1 bulan.');
    }

    // Hanya metode pembayaran yang dipakai aplikasi ('dp' | 'full') yang boleh
    // diterima; nilai arbitrer tidak boleh tersimpan.
    if (paymentType !== 'dp' && paymentType !== 'full') {
      throw new BadRequestException('Metode pembayaran tidak valid.');
    }

    if (typeof startDateString !== 'string' || startDateString.trim() === '') {
      throw new BadRequestException('Tanggal mulai tidak valid.');
    }

    const startDate = new Date(startDateString);
    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Tanggal mulai tidak valid.');
    }

    const targetBillboard = await this.prisma.billboard.findUnique({
      where: { id: billboardId },
    });

    if (!targetBillboard || targetBillboard.status !== 'Available') {
      throw new BadRequestException('Billboard tidak tersedia.');
    }

    // Sumber kebenaran harga adalah harga billboard di database, bukan
    // `totalPrice`/`dpAmount` dari client (field itu boleh dikirim untuk
    // kompatibilitas tapi diabaikan).
    const pricePerMonth = targetBillboard.price;
    if (typeof pricePerMonth !== 'number' || !Number.isFinite(pricePerMonth) || pricePerMonth <= 0) {
      throw new BadRequestException('Harga billboard tidak valid.');
    }

    // Formula sama dengan CheckoutForm.tsx:
    // subTotal = price * duration; PPN 11%; admin fee Rp 50.000;
    // grandTotal = subTotal + ppn + adminFee; DP = 60% grandTotal.
    const adminFee = 50000;
    const subTotalSewa = pricePerMonth * duration;
    const ppn = subTotalSewa * 0.11;
    const totalPrice = subTotalSewa + ppn + adminFee;
    const dpAmount = paymentType === 'dp' ? totalPrice * 0.6 : 0;

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + duration);

    try {
      // Cek overlap + insert booking dijalankan dalam satu transaction, dan
      // baris billboard dikunci dengan FOR UPDATE lebih dahulu sehingga dua
      // request concurrent untuk billboard yang sama tidak bisa sama-sama
      // lolos cek overlap (check-then-insert jadi atomic per billboard).
      const newBooking = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Billboard" WHERE id = ${billboardId} FOR UPDATE`;

        // Definisi overlap (boundary ketat, tanpa <= / >=):
        //   existing.startDate < newEndDate
        //   AND existing.endDate > newStartDate
        const overlappingBooking = await tx.booking.findFirst({
          where: {
            billboardId,
            status: { notIn: NON_BLOCKING_BOOKING_STATUSES },
            startDate: { lt: endDate },
            endDate: { gt: startDate },
          },
          select: { id: true },
        });

        if (overlappingBooking) {
          throw new ConflictException('Billboard sudah dibooking pada rentang tanggal tersebut.');
        }

        return tx.booking.create({
          data: {
            userId: user.id,
            billboardId,
            startDate,
            endDate,
            duration,
            totalPrice,
            dpAmount,
            status: 'PENDING_PAYMENT',
            designOption,
          },
        });
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
      // Conflict (409) dari cek overlap harus diteruskan ke client, jangan
      // ditelan menjadi error server generik.
      if (error instanceof ConflictException) {
        throw error;
      }
      console.error('🔥 Server Error:', error);
      throw new InternalServerErrorException('Error Server');
    }
  }

  async submitDesign(submitDesignDto: SubmitDesignDto, actorId: string) {
    const { orderId, designUrl } = submitDesignDto;
    await this.assertOrderOwner(orderId, actorId);

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

  async cancel(cancelBookingDto: CancelBookingDto, actorId: string) {
    const { orderId } = cancelBookingDto;
    await this.assertOrderOwner(orderId, actorId);

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

  async requestRefund(requestRefundDto: RequestRefundDto, actorId: string) {
    const { step, orderId, reason, bankName, bankAccount } = requestRefundDto;
    await this.assertOrderOwner(orderId, actorId);
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
