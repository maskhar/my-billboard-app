
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { UpdateOrderDto } from './dto/update-order.dto';

@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('update-status')
  @HttpCode(HttpStatus.OK)
  updateOrderStatus(@Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.updateOrderStatus(updateOrderDto);
  }
}
