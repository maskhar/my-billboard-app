import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { SubmitDesignDto } from './dto/submit-design.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RequestRefundDto } from './dto/request-refund.dto';
export declare class BookingsController {
    private readonly bookingsService;
    constructor(bookingsService: BookingsService);
    create(createBookingDto: CreateBookingDto): Promise<{
        message: string;
        orderId: string;
    }>;
    submitDesign(submitDesignDto: SubmitDesignDto): Promise<{
        message: string;
    }>;
    cancel(cancelBookingDto: CancelBookingDto): Promise<{
        message: string;
    }>;
    requestRefund(requestRefundDto: RequestRefundDto): Promise<{
        message: string;
    }>;
}
