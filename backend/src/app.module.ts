// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { BillboardsModule } from './billboards/billboards.module';
import { UsersModule } from './users/users.module';
import { PaymentsModule } from './payments/payments.module';
import { BookingsModule } from './bookings/bookings.module';
import { OrdersModule } from './orders/orders.module';
import { UploadsModule } from './uploads/uploads.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    PrismaModule,
    BillboardsModule,
    ChatModule,
    UsersModule,
    UploadsModule,
    OrdersModule,
    BookingsModule,
    PaymentsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
