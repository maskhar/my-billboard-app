import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Membuat instance (koneksi) baru jika belum ada
export const prisma = globalForPrisma.prisma || new PrismaClient();

// Mencegah koneksi ganda (double connection) saat hot-reload (pengembangan)
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;