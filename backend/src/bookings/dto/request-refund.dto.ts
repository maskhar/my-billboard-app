
export class RequestRefundDto {
  step!: 'reason' | 'bank';
  orderId!: string;
  reason?: string;
  bankName?: string;
  bankAccount?: string;
}
