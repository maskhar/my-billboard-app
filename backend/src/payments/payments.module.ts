
import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../lib/mail.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PrismaService, MailService],
})
export class PaymentsModule {}
