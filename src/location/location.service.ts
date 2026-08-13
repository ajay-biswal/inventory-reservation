import { Injectable } from '@nestjs/common';
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { CreateServiceZoneDto } from './dto/create-service-zone.js';

@Injectable()
export class LocationService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(dto: CreateLocationDto) {
    return this.prisma.location.create({
      data: {
        name: dto.name,
        city: dto.city,
        state: dto.state,
        priority: dto.priority ?? 1,
        active: dto.active ?? true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.location.findUnique({
      where: { id },
      include: {
        serviceZones: true,
      },
    });
  }

  async addServiceZone(
  locationId: string,
  dto: CreateServiceZoneDto,
) {
  const location = await this.prisma.location.findUnique({
    where: {
      id: locationId,
    },
  });

  if (!location) {
    throw new NotFoundException('Location not found');
  }

  try {
    return await this.prisma.serviceZone.create({
      data: {
        locationId,
        pincode: dto.pincode,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Location already serves this pincode',
      );
    }

    throw error;
  }
}
}