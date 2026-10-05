import { Controller, Post, UseInterceptors, UploadedFile, Body, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { mkdir, writeFile } from 'fs/promises';
import { join, extname } from 'path';

const UPLOAD_DIR = join(process.cwd(), 'public/uploads/designs');

// Samakan dengan `fileFilter` di bawah: kalau MIME-nya sudah dibatasi, jangan
// biarkan ekstensi taken dari `originalname` mentah. Tanpa ini file bisa
// bernama `evil.html` dikirim sebagai `image/png`, lalu tersimpan sebagai
// `/uploads/designs/DESIGN-xxx.html` dan dieksekusi sebagai HTML karena
// folder itu disajikan statis dari origin yang sama.
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

@Controller('api/uploads')
export class UploadsController {
  @Post('design')
  @UseInterceptors(FileInterceptor('file', {
    // PENTING: pakai memoryStorage, bukan diskStorage.
    // `diskStorage.filename` berjalan saat file stream mulai diproses, sedangkan
    // busboy baru mengisi `req.body` untuk field yang muncul SEBELUM file di
    // payload multipart. BookingCard.tsx mengirim `file` lebih dulu lalu
    // `orderId`, jadi `req.body.orderId` masih kosong di dalam callback ->
    // upload desain selalu gagal dengan "orderId is required".
    // Di memoryStorage seluruh multipart sudah ter-parse sebelum handler jalan,
    // jadi `@Body('orderId')` pasti terisi.
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Format must be Image or PDF'), false);
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
    },
  }))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('orderId') orderId: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // `String(...)` dipakai karena FormData bisa mengirim orderId berulang;
    // kalau jadi array, `.replace` akan melempar TypeError.
    const rawOrderId = String(orderId ?? '').trim();
    if (!rawOrderId) {
      throw new BadRequestException('orderId is required');
    }

    // Karakter selain angka/huruf/underscore/dash dibuang supaya orderId tidak
    // bisa menyuntik path (mis. "../../") sekaligus menimpa file order lain.
    // Pola ini sama dengan yang dipakai di src/app/api/upload/route.ts.
    const safeOrderId = rawOrderId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeOrderId) {
      // orderId-nya ada tapi seluruh karakternya dibuang (mis. "../../"),
      // jadi tidak ada yang bisa dijadikan nama file yang aman.
      throw new BadRequestException('orderId tidak valid');
    }

    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      throw new BadRequestException('Format must be Image or PDF');
    }

    const filename = `DESIGN-${safeOrderId}${ext}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, filename), file.buffer);

    // Mengembalikan path yang dapat diakses oleh frontend
    return { url: `/uploads/designs/${filename}` };
  }
}