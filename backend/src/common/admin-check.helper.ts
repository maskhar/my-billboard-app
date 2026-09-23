import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

export async function assertAdmin(prisma: PrismaService, email?: string) {
  if (!email) {
    throw new UnauthorizedException(
      'Akses ditolak: butuh email admin (kirim adminEmail di body request).',
    );
  }

  const admin = await prisma.user.findUnique({
    where: { email },
  });

  if (!admin || !ADMIN_ROLES.includes(admin.role)) {
    throw new UnauthorizedException(
      'Akses ditolak: email tersebut tidak terdaftar sebagai admin.',
    );
  }

  return admin;
}