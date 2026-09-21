"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const mail_service_1 = require("../lib/mail.service");
let BookingsService = class BookingsService {
    constructor(prisma, mailService) {
        this.prisma = prisma;
        this.mailService = mailService;
    }
    async create(createBookingDto, user) {
        if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
            throw new common_1.ForbiddenException('Admin dilarang membuat pesanan.');
        }
        const { billboardId, duration, totalPrice, dpAmount, paymentType, designOption, startDateString, } = createBookingDto;
        const targetBillboard = await this.prisma.billboard.findUnique({
            where: { id: billboardId },
        });
        if (!targetBillboard || targetBillboard.status !== 'Available') {
            throw new common_1.BadRequestException('Billboard tidak tersedia.');
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
        }
        catch (error) {
            console.error('🔥 Server Error:', error);
            throw new common_1.InternalServerErrorException('Error Server');
        }
    }
    async submitDesign(submitDesignDto) {
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
        }
        catch (error) {
            throw new common_1.InternalServerErrorException('Gagal');
        }
    }
    async cancel(cancelBookingDto) {
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
        }
        catch (error) {
            throw new common_1.InternalServerErrorException('Gagal membatalkan');
        }
    }
    async requestRefund(requestRefundDto) {
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
            const refundNominal = ((orderData === null || orderData === void 0 ? void 0 : orderData.totalPrice) || 0) * 0.9;
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
                    message: `User telah memasukkan data rekening. Mohon segera transfer pengembalian dana Rp ${refundNominal.toLocaleString('id-ID')}.<br/>Bank: ${bankName} - ${bankAccount}`,
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
        throw new common_1.BadRequestException('Invalid step');
    }
};
exports.BookingsService = BookingsService;
exports.BookingsService = BookingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        mail_service_1.MailService])
], BookingsService);
//# sourceMappingURL=bookings.service.js.map