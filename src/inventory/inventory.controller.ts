import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { AddInventoryDto } from './dto/add-inventory.dto.js';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
  ) {}

  @Post()
  addInventory(@Body() dto: AddInventoryDto) {
    return this.inventoryService.addInventory(dto);
  }

  @Get('product/:productId')
  getProductInventory(
    @Param('productId') productId: string,
  ) {
    return this.inventoryService.getProductInventory(productId);
  }

  // @Get('location/:locationId')
  // getLocationInventory(
  //   @Param('locationId') locationId: string,
  // ) {
  //   return this.inventoryService.getLocationInventory(locationId);
  // }


  @Get(':productId/:locationId/availability')
async getAvailability(
  @Param('productId') productId: string,
  @Param('locationId') locationId: string,
) {
  return this.inventoryService.getAvailability(
    productId,
    locationId,
  );
}

@Get('/locations/:locationId/inventory')
async getLocationInventory(
  @Param('locationId') locationId: string,
) {
  return this.inventoryService.getLocationInventory(
    locationId,
  );
}
}