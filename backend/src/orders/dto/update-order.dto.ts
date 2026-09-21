
export class UpdateOrderDto {
  orderId!: string;
  newStatus!: string;
  reason?: string;
  refundProof?: string;
  installationProof?: string;
  isLocked?: boolean;
}
