
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
      throw new InternalServerErrorException('Terjadi kesalahan pada server.');
    }
  }
}


