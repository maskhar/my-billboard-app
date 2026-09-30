// backend/src/billboards/billboards.module.ts
import { Module } from '@nestjs/common';
import { BillboardsController } from './billboards.controller';
import { BillboardsService } from './billboards.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BillboardsController],
  providers: [BillboardsService],
})
export class BillboardsModule {}
