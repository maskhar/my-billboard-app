// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(__dirname, '..', 'public'));

  // Mengaktifkan CORS agar frontend bisa berkomunikasi
  app.enableCors();

  // Memastikan koneksi Prisma ditutup dengan benar saat aplikasi berhenti
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  // Menjalankan server di port 4001
  await app.listen(4001);
  console.log(`🚀 Backend server (NestJS) berjalan di http://localhost:4001`);
}
bootstrap();
