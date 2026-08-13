import { IsBoolean } from 'class-validator';

export class PaymentResultDto {
  @IsBoolean()
  success: boolean;
}