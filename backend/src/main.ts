// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { join } from 'path';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.useStaticAssets(join(__dirname, '..', 'public'));

  // Dibutuhkan NextAuthSessionGuard: getToken() dari next-auth membaca
  // req.cookies, bukan header cookie mentah.
  app.use(cookieParser());

  // Frontend (localhost:4000) dan backend (localhost:4001) adalah origin berbeda,
  // jadi cookie session hanya terkirim bila frontend memakai
  // `credentials: 'include'` DAN backend mengirim
  // `Access-Control-Allow-Credentials: true`. Browser menolak wildcard
  // `Access-Control-Allow-Origin: *` pada request ber-credential, jadi origin
  // harus berupa allowlist spesifik.
  const allowedOrigins = (config.get<string>('FRONTEND_URL') || 'http://localhost:4000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Permintaan tanpa Origin (curl, health check, SSR) tetap diizinkan.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Origin tidak di allowlist -> jangan kirim header CORS sama sekali,
      // sehingga browser memblokir respons. Throw error di sini hanya
      // menghasilkan 500 yang membingungkan.
      return callback(null, false);
    },
    credentials: true,
  });

  // Memastikan koneksi Prisma ditutup dengan benar saat aplikasi berhenti
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  // Menjalankan server di port 4001
  await app.listen(4001);
  console.log(`🚀 Backend server (NestJS) berjalan di http://localhost:4001`);
  console.log(`   CORS origins: ${allowedOrigins.join(', ')} (credentials: true)`);
}
bootstrap();
