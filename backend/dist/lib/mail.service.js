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
exports.MailService = void 0;
const nodemailer = require("nodemailer");
const common_1 = require("@nestjs/common");
let MailService = class MailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: true,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }
    formatRupiah(number) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(number);
    }
    generateTemplate(title, message, orderDetail) {
        return `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 680px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 12px; overflow: hidden; background-color: #fcfcfc;">
        <div style="background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 1px solid #eaeaea;">
            <h2 style="color: #1a1a1a; margin: 0; letter-spacing: -1px; font-size: 24px;">UTERO <span style="color: #CE181E;">CLOUD</span></h2>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 12px; letter-spacing: 1px;">PREMIUM OUTDOOR MEDIA</p>
        </div>

        <div style="padding: 40px 30px;">
            <h3 style="color: #CE181E; margin-top: 0;">${title}</h3>
            <p style="font-size: 15px; line-height: 1.6; color: #444;">${message}</p>
            
            ${orderDetail
            ? `
            <div style="background-color: #fff; padding: 25px; border-radius: 12px; margin-top: 25px; border: 1px solid #e0e0e0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding-bottom: 15px; border-bottom: 1px dashed #ddd; font-size: 13px; color: #888;">Order ID</td>
                        <td style="padding-bottom: 15px; border-bottom: 1px dashed #ddd; font-size: 13px; font-weight: bold; text-align: right; color: #111;">#${orderDetail.id ? orderDetail.id.slice(-8).toUpperCase() : 'NEW'}</td>
                    </tr>
                    <tr>
                        <td colspan="2" style="padding-top: 15px; font-size: 16px; font-weight: bold; color: #000; padding-bottom: 5px;">${orderDetail.billboardTitle || 'Produk Sewa'}</td>
                    </tr>
                    <tr>
                        <td colspan="2" style="font-size: 13px; color: #666; padding-bottom: 15px; border-bottom: 1px dashed #ddd;">${orderDetail.billboardAddress || ''}</td>
                    </tr>
                    <tr>
                        <td style="padding: 15px 0 5px; font-size: 13px; color: #888;">Durasi</td>
                        <td style="padding: 15px 0 5px; font-weight: bold; text-align: right;">${orderDetail.duration || 1} Bulan</td>
                    </tr>
                    <tr>
                        <td style="padding-top: 15px; border-top: 2px solid #333; font-size: 16px; font-weight: bold; color: #333;">Total</td>
                        <td style="padding-top: 15px; border-top: 2px solid #333; font-size: 20px; font-weight: bold; text-align: right; color: #CE181E;">
                             ${this.formatRupiah(orderDetail.total)}
                        </td>
                    </tr>
                </table>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="${process.env.NEXTAUTH_URL}/invoice/${orderDetail.id}" style="background-color: #111; color: #fff; padding: 12px 25px; border-radius: 50px; text-decoration: none; font-size: 14px; font-weight: bold;">Lihat Invoice di Web &rarr;</a>
            </div>
            `
            : ''}

            <p style="font-size: 12px; color: #aaa; margin-top: 40px; text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
                &copy; 2025 Utero Indonesia
            </p>
        </div>
    </div>
    `;
    }
    async sendEmail({ to, subject, title, message, orderDetail }) {
        if (!to) {
            console.warn('⚠️ Email batal dikirim: Penerima (to) tidak didefinisikan.');
            return false;
        }
        try {
            const info = await this.transporter.sendMail({
                from: process.env.MAIL_FROM,
                to: to,
                subject: subject,
                html: this.generateTemplate(title, message, orderDetail),
            });
            console.log('✅ Email Terkirim ke:', to, '| ID:', info.messageId);
            return true;
        }
        catch (error) {
            console.error('🔥 Gagal Kirim Email:', error);
            return false;
        }
    }
};
exports.MailService = MailService;
exports.MailService = MailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MailService);
//# sourceMappingURL=mail.service.js.map