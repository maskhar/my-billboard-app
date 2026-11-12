
import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../lib/mail.service';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, PrismaService, MailService],
})
export class BookingsModule {}
