// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { NextAuthSessionGuard } from './auth/nextauth-session.guard';
import { RolesGuard } from './auth/roles.guard';
import { BillboardsModule } from './billboards/billboards.module';
import { UsersModule } from './users/users.module';
import { PaymentsModule } from './payments/payments.module';
import { BookingsModule } from './bookings/bookings.module';
import { OrdersModule } from './orders/orders.module';
import { UploadsModule } from './uploads/uploads.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    BillboardsModule,
    ChatModule,
    UsersModule,
    UploadsModule,
    OrdersModule,
    BookingsModule,
    PaymentsModule,
  ],
  controllers: [],
  providers: [
    // Urutan penting: session guard mengisi req.user, baru roles guard mengeceknya.
    { provide: APP_GUARD, useClass: NextAuthSessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
