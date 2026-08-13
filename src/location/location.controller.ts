import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CreateLocationDto } from './dto/create-location.dto.js';
import { CreateServiceZoneDto } from './dto/create-service-zone.js';
import { LocationService } from './location.service.js';


@Controller('locations')
export class LocationController {
  constructor(
    private readonly locationService: LocationService,
  ) {}

  @Post()
  create(@Body() dto: CreateLocationDto) {
    return this.locationService.create(dto);
  }

  @Post(':locationId/service-zones')
addServiceZone(
  @Param('locationId') locationId: string,
  @Body() dto: CreateServiceZoneDto,
) {
  return this.locationService.addServiceZone(
    locationId,
    dto,
  );
}

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.locationService.findById(id);
  }
}