
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
  create(@Body() createBookingDto: CreateBookingDto & { userId?: string }) {
    // TODO: ganti ke JWT guard proper setelah keputusan arsitektur auth final.
    // Untuk sementara userId diambil dari body (dikirim dari session NextAuth frontend)
    // dan divalidasi (user harus benar-benar ada di database) oleh BookingsService.
    return this.bookingsService.create(createBookingDto);
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
