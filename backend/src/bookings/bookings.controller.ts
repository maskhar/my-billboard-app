
import { Controller, Post, Body } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { SubmitDesignDto } from './dto/submit-design.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RequestRefundDto } from './dto/request-refund.dto';
import { CurrentUser } from '../auth/auth-user';
import type { AuthUser } from '../auth/auth-user';

@Controller('api/bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // `userId` TIDAK lagi diambil dari body. Identitas pemesan berasal dari
  // cookie session NextAuth yang sudah diverifikasi NextAuthSessionGuard, jadi
  // tidak bisa dipalsukan. Field `userId` di body (bila frontend lama masih
  // mengirimnya) diabaikan sepenuhnya.
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() createBookingDto: CreateBookingDto) {
    return this.bookingsService.create(createBookingDto, user.id);
  }

  @Post('submit-design')
  submitDesign(@CurrentUser() user: AuthUser, @Body() submitDesignDto: SubmitDesignDto) {
    return this.bookingsService.submitDesign(submitDesignDto, user.id);
  }

  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser, @Body() cancelBookingDto: CancelBookingDto) {
    return this.bookingsService.cancel(cancelBookingDto, user.id);
  }

  @Post('request-refund')
  requestRefund(@CurrentUser() user: AuthUser, @Body() requestRefundDto: RequestRefundDto) {
    return this.bookingsService.requestRefund(requestRefundDto, user.id);
  }
}
