
import { Controller, Post, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, Body, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('api/uploads')
export class UploadsController {
  @Post('design')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './public/uploads/designs',
      filename: (req, file, cb) => {
        // Dapatkan orderId dari body request
        const orderId = req.body.orderId;
        if (!orderId) {
          // Kembalikan error jika orderId tidak ada
          return cb(new BadRequestException('orderId is required'), '');
        }
        const ext = extname(file.originalname);
        const filename = `DESIGN-${orderId}${ext}`;
        cb(null, filename);
      },
    }),
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
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('orderId') orderId: string,
    ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    // Mengembalikan path yang dapat diakses oleh frontend
    return { url: `/uploads/designs/${file.filename}` };
  }
}
