
export class CreateBookingDto {
  billboardId!: string;
  duration!: number;
  totalPrice!: number;
  dpAmount?: number;
  paymentType!: 'dp' | 'full';
  designOption!: string;
  startDateString!: string;
}
