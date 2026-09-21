
export class UpdateBillboardDto {
  title?: string;
  slug?: string;
  sku?: string;
  address?: string;
  type?: string;
  price?: number;
  lat?: number;
  lng?: number;
  status?: string;
  publishStatus?: string;
  mainImage?: string;
  sizeH?: number;
  sizeW?: number;
  orientation?: string;
  sides?: number;
  lighting?: string;
  material?: string;
  adminOptions?: any[];
  gallery?: string[];
  smartsucoUrl?: string;
}
