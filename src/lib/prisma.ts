import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Membuat instance (koneksi) baru jika belum ada
export const prisma = globalForPrisma.prisma || new PrismaClient();

// Mencegah koneksi ganda (double connection) saat hot-reload (pengembangan)
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// CATATAN POOLING (task 3.12)
// ---------------------------
// Audit menyarankan menambahkan `?pgbouncer=true&connection_limit=1` pada
// DATABASE_URL. Saran itu ditujukan untuk deployment serverless (Vercel,
// Lambda), di mana setiap request bisa menghidupkan proses baru dan setiap
// proses membuka pool Postgres sendiri — ratusan koneksi menumpuk sampai
// server menolak yang berikutnya dengan "too many clients already".
//
// Aplikasi ini TIDAK serverless: ia berjalan sebagai satu proses Node yang
// hidup terus, dengan Postgres di container sebelahnya. Satu proses = satu
// pool, dan `connection_limit=1` justru akan MENYERIALKAN seluruh query
// aplikasi lewat satu koneksi tunggal — setiap permintaan mengantre di
// belakang yang lain. `pgbouncer=true` juga mematikan prepared statement,
// yang tidak ada gunanya tanpa PgBouncer di depan.
//
// Jadi ini sengaja dibiarkan memakai default Prisma. Bila suatu saat
// aplikasi dipindah ke platform serverless, parameter itu WAJIB ditambahkan
// ke DATABASE_URL — dan PgBouncer harus benar-benar ada di jalurnya.