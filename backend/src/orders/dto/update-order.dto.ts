
export class UpdateOrderDto {
  orderId!: string;
  newStatus!: string;
  adminEmail?: string;
  reason?: string;
  refundProof?: string;
  installationProof?: string;
  isLocked?: boolean;
}
