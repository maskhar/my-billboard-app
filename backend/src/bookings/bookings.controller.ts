
import { Controller, Post, Body } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { SubmitDesignDto } from './dto/submit-design.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RequestRefundDto } from './dto/request-refund.dto';

@Controller('api/bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(@Body() createBookingDto: CreateBookingDto) {
    // In a real app, you'd get the user from the authenticated session
    const user = { id: 'clerk-user-id', name: 'Test User', email: 'test@example.com', role: 'USER' }; // Placeholder
    return this.bookingsService.create(createBookingDto, user);
  }

  @Post('submit-design')
  submitDesign(@Body() submitDesignDto: SubmitDesignDto) {
    return this.bookingsService.submitDesign(submitDesignDto);
  }

  @Post('cancel')
  cancel(@Body() cancelBookingDto: CancelBookingDto) {
    return this.bookingsService.cancel(cancelBookingDto);
  }

  @Post('request-refund')
  requestRefund(@Body() requestRefundDto: RequestRefundDto) {
    return this.bookingsService.requestRefund(requestRefundDto);
  }
}
