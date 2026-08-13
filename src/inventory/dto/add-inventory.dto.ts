import {
  IsInt,
  IsNotEmpty,
  IsUUID,
  Min,
} from 'class-validator';

export class AddInventoryDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  locationId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}