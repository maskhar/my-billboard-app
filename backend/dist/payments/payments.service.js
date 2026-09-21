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
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const mail_service_1 = require("../lib/mail.service");
let PaymentsService = class PaymentsService {
    constructor(prisma, mailService) {
        this.prisma = prisma;
        this.mailService = mailService;
    }
    async handlePaymentNotification(paymentNotificationDto) {
        const { orderId } = paymentNotificationDto;
        console.log('💰 [NOTIFY] Menerima sinyal bayar untuk order:', orderId);
        const order = await this.prisma.booking.findUnique({
            where: { id: orderId },
            include: { user: true, billboard: true },
        });
        if (!order) {
            console.error('❌ Order tidak ditemukan!');
            throw new common_1.NotFoundException('Order not found');
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
                    message: `User <b>${order.user.name}</b> sudah membayar lunas. Total: Rp ${order.totalPrice.toLocaleString('id-ID')}.<br/>Segera cek dashboard dan Klik Terima.`,
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
                    message: `Terima kasih! Dana sebesar Rp ${order.totalPrice.toLocaleString('id-ID')} sudah masuk ke sistem kami. Tim Admin akan memverifikasi dalam waktu singkat.`,
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
        }
        catch (error) {
            console.error('🔥 Server Error (Notify):', error.message);
            throw new common_1.InternalServerErrorException('Server Error');
        }
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        mail_service_1.MailService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map