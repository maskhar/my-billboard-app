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
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const mail_service_1 = require("../lib/mail.service");
let OrdersService = class OrdersService {
    constructor(prisma, mailService) {
        this.prisma = prisma;
        this.mailService = mailService;
    }
    async updateOrderStatus(updateOrderDto) {
        const { orderId, newStatus, reason, refundProof, installationProof, isLocked } = updateOrderDto;
        try {
            const updateData = Object.assign(Object.assign(Object.assign(Object.assign({ status: newStatus }, (reason && { cancelReason: reason })), (refundProof && { refundProof: refundProof })), (installationProof && { installationProof: installationProof })), (isLocked !== undefined && { isLocked: isLocked }));
            if (newStatus === 'REFUNDED') {
                const currentOrder = await this.prisma.booking.findUnique({ where: { id: orderId } });
                if (!(currentOrder === null || currentOrder === void 0 ? void 0 : currentOrder.refundedAt)) {
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
                let subject = '', title = '', message = '';
                if (newStatus === 'ACTIVE') {
                    subject = `✅ Pembayaran Diterima - Order #${updatedOrder.id.slice(-6).toUpperCase()}`;
                    title = 'Pembayaran Berhasil! Order Aktif.';
                    message = `Halo ${updatedOrder.user.name}, pembayaran Anda telah kami terima. Billboard "${updatedOrder.billboard.title}" sekarang berstatus AKTIF dan siap tayang.`;
                }
                else if (newStatus === 'REFUNDED') {
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
        }
        catch (error) {
            console.error('Update Error:', error);
            throw new common_1.InternalServerErrorException('Gagal Update');
        }
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        mail_service_1.MailService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map