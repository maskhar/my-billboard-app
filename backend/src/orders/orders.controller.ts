
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Roles } from '../auth/roles.decorator';
import { ADMIN_ROLES } from '../auth/admin-roles';

@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles(...ADMIN_ROLES)
  @Post('update-status')
  @HttpCode(HttpStatus.OK)
  // `adminEmail` masih diterima di body demi kompatibilitas dengan frontend
  // lama, tapi TIDAK lagi dipakai untuk validasi — guard pakai req.user.role.
  updateOrderStatus(@Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.updateOrderStatus(updateOrderDto);
  }
}
