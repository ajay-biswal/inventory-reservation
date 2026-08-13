import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}