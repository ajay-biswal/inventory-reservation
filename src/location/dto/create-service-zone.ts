import {
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';

export class CreateServiceZoneDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, {
    message: 'Pincode must be a 6-digit number',
  })
  pincode: string;
}