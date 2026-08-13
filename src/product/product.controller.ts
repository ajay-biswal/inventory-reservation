import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CreateProductDto } from './dto/create-product.dto.js';
import { ProductService } from './product.service.js';

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
  ) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.productService.findById(id);
  }
}