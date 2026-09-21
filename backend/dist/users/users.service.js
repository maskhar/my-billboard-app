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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const bcryptjs_1 = require("bcryptjs");
let UsersService = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(createUserDto) {
    }
    async updateProfile(userId, updateProfileDto) {
    }
    async changePassword(userId, changePasswordDto) {
        const { currentPassword, newPassword } = changePasswordDto;
        if (!currentPassword || !newPassword) {
            throw new common_1.BadRequestException('Semua field password harus diisi.');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user || !user.password) {
            throw new common_1.NotFoundException('Pengguna tidak ditemukan atau tidak memiliki password (mungkin login via Google?).');
        }
        const isPasswordValid = await (0, bcryptjs_1.compare)(currentPassword, user.password);
        if (!isPasswordValid) {
            throw new common_1.ForbiddenException('Password saat ini salah.');
        }
        const hashedNewPassword = await (0, bcryptjs_1.hash)(newPassword, 10);
        try {
            await this.prisma.user.update({
                where: { id: userId },
                data: {
                    password: hashedNewPassword
                }
            });
        }
        catch (error) {
            throw new common_1.InternalServerErrorException('Terjadi kesalahan pada server.');
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map