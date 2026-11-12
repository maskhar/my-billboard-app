
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hash, compare } from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AdminCreateUserDto, UserRole, USER_ROLES } from './dto/admin-create-user.dto';
import { AdminUpdateAccountDto } from './dto/admin-update-account.dto';
import { AdminUpdateBusinessDto } from './dto/admin-update-business.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const { email, password, name, phone } = createUserDto;

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const hashedPassword = await hash(password, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          whatsapp: phone,
        },
      });

      const { password: _password, ...safeUser } = user;
      return safeUser;
    } catch (error) {
      console.error('Create user error:', error);
      throw new InternalServerErrorException('Terjadi kesalahan pada server.');
    }
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan.');
    }

    const data: { name?: string; whatsapp?: string } = {};
    if (updateProfileDto.name !== undefined) data.name = updateProfileDto.name;
    if (updateProfileDto.whatsapp !== undefined) data.whatsapp = updateProfileDto.whatsapp;

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data,
      });

      const { password: _password, ...safeUser } = updatedUser;
      return safeUser;
    } catch (error) {
      console.error('Update profile error:', error);
      throw new InternalServerErrorException('Terjadi kesalahan pada server.');
    }
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Semua field password harus diisi.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.password) {
      throw new NotFoundException(
        'Pengguna tidak ditemukan atau tidak memiliki password (mungkin login via Google?).'
      );
    }

    const isPasswordValid = await compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new ForbiddenException('Password saat ini salah.');
    }

    const hashedNewPassword = await hash(newPassword, 10);

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedNewPassword
        }
      });
    } catch (error) {
      console.error('Change password error:', error);
      throw new InternalServerErrorException('Terjadi kesalahan pada server.');
    }
  }

  async adminCreate(dto: AdminCreateUserDto) {
    const { name, email, password, role } = dto;

    if (!name || !email || !password || !role) {
      throw new BadRequestException('Semua field harus diisi.');
    }

    if (!USER_ROLES.includes(role as UserRole)) {
      throw new BadRequestException('Role tidak valid.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const hashedPassword = await hash(password, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role,
          authProvider: 'EMAIL',
          isVerified: true,
        },
      });

      const { password: _password, ...safeUser } = user;
      return safeUser;
    } catch (error) {
      console.error('Admin create user error:', error);
      throw new InternalServerErrorException('Terjadi kesalahan pada server.');
    }
  }

  async adminUpdateAccount(
    targetUserId: string,
    dto: AdminUpdateAccountDto,
    actorRole: string | null,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!target) {
      throw new NotFoundException('Pengguna tidak ditemukan.');
    }

    if (target.role === UserRole.SUPER_ADMIN && actorRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Anda tidak bisa mengubah akun Super Admin.');
    }

    const data: { username?: string; whatsapp?: string; password?: string } = {};
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.whatsapp !== undefined) data.whatsapp = dto.whatsapp;
    if (dto.password) data.password = await hash(dto.password, 10);

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: targetUserId },
        data,
      });

      const { password: _password, ...safeUser } = updatedUser;
      return safeUser;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Username sudah digunakan.');
      }
      console.error('Admin update account error:', error);
      throw new InternalServerErrorException('Terjadi kesalahan pada server.');
    }
  }

  async adminUpdateBusiness(targetUserId: string, dto: AdminUpdateBusinessDto) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException('Pengguna tidak ditemukan.');
    }

    const data: {
      name?: string;
      companyName?: string;
      ktp?: string;
      npwp?: string;
      ktpAddress?: string;
      officeAddress?: string;
    } = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.companyName !== undefined) data.companyName = dto.companyName;
    if (dto.ktp !== undefined) data.ktp = dto.ktp;
    if (dto.npwp !== undefined) data.npwp = dto.npwp;
    if (dto.ktpAddress !== undefined) data.ktpAddress = dto.ktpAddress;
    if (dto.officeAddress !== undefined) data.officeAddress = dto.officeAddress;

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: targetUserId },
        data,
      });

      const { password: _password, ...safeUser } = updatedUser;
      return safeUser;
    } catch (error) {
      console.error('Admin update business error:', error);
      throw new InternalServerErrorException('Terjadi kesalahan pada server.');
    }
  }

  async adminUpdateRole(targetUserId: string, newRole: string, actorRole: string | null) {
    if (!newRole || !USER_ROLES.includes(newRole as UserRole)) {
      throw new BadRequestException('Role tidak valid.');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!target) {
      throw new NotFoundException('Pengguna tidak ditemukan.');
    }

    if (
      actorRole !== UserRole.SUPER_ADMIN &&
      (newRole === UserRole.SUPER_ADMIN || target.role === UserRole.SUPER_ADMIN)
    ) {
      throw new ForbiddenException(
        'Anda tidak dapat mengubah role Super Admin atau menetapkan Super Admin.',
      );
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: targetUserId },
        data: { role: newRole },
      });

      const { password: _password, ...safeUser } = updatedUser;
      return safeUser;
    } catch (error) {
      console.error('Admin update role error:', error);
      throw new InternalServerErrorException('Terjadi kesalahan pada server.');
    }
  }

  async adminDelete(targetUserId: string) {
    const activeBookings = await this.prisma.booking.findFirst({
      where: {
        userId: targetUserId,
        status: { in: ['ACTIVE', 'PENDING_PAYMENT', 'PROCESS_REFUND'] },
      },
    });

    if (activeBookings) {
      throw new BadRequestException('Gagal: User ini sedang memiliki transaksi aktif.');
    }

    try {
      await this.prisma.$transaction([
        this.prisma.booking.deleteMany({ where: { userId: targetUserId } }),
        this.prisma.user.delete({ where: { id: targetUserId } }),
      ]);

      return { message: 'User Berhasil Dihapus' };
    } catch (error) {
      console.error('Admin delete user error:', error);
      throw new InternalServerErrorException('Gagal menghapus user');
    }
  }
}


