import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaModule } from '../prisma/prisma.module'; // Impor PrismaModule
import { MailModule } from '../lib/mail.module'; // Impor MailModule

@Module({
  imports: [PrismaModule, MailModule], // Tambahkan ke imports
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
