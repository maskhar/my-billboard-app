import { OrdersService } from './orders.service';
import { UpdateOrderDto } from './dto/update-order.dto';
export declare class OrdersController {
    private readonly ordersService;
    constructor(ordersService: OrdersService);
    updateOrderStatus(updateOrderDto: UpdateOrderDto): Promise<{
        message: string;
    }>;
}
