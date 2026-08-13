import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class CreateCheckoutDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, {
    message: 'Delivery pincode must be a 6-digit number',
  })
  deliveryPincode: string;

  @IsString()
  @IsNotEmpty()
  deliveryCity: string;

  @IsString()
  @IsNotEmpty()
  deliveryState: string;
}