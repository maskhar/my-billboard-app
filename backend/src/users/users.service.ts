
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
    // ... (existing create method)
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    // ... (existing updateProfile method)
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


