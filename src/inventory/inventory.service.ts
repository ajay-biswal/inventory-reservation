import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { AddInventoryDto } from './dto/add-inventory.dto.js';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async addInventory(dto: AddInventoryDto) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: dto.productId,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const location = await this.prisma.location.findUnique({
      where: {
        id: dto.locationId,
      },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return this.prisma.inventory.upsert({
      where: {
        productId_locationId: {
          productId: dto.productId,
          locationId: dto.locationId,
        },
      },
      create: {
        productId: dto.productId,
        locationId: dto.locationId,
        stock: dto.quantity,
      },
      update: {
        stock: {
          increment: dto.quantity,
        },
      },
    });
  }

  async getProductInventory(productId: string) {
    return this.prisma.inventory.findMany({
      where: {
        productId,
      },
      include: {
        location: true,
      },
    });
  }

  // async getLocationInventory(locationId: string) {
  //   return this.prisma.inventory.findMany({
  //     where: {
  //       locationId,
  //     },
  //     include: {
  //       product: true,
  //     },
  //   });
  // }

  async getAvailability(productId: string, locationId: string) {
  const inventory = await this.prisma.inventory.findUnique({
    where: {
      productId_locationId: {
        productId,
        locationId,
      },
    },
  });

  if (!inventory) {
    throw new NotFoundException(
      'Inventory not found for this product at this location',
    );
  }

  return {
    productId: inventory.productId,
    locationId: inventory.locationId,
    stock: inventory.stock,
    reserved: inventory.reserved,
    available: inventory.stock - inventory.reserved,
  };
}

async getLocationInventory(locationId: string) {
  const location = await this.prisma.location.findUnique({
    where: {
      id: locationId,
    },
    include: {
      inventory: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!location) {
    throw new NotFoundException('Location not found');
  }

  return {
    locationId: location.id,
    locationName: location.name,

    inventory: location.inventory.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      stock: item.stock,
      reserved: item.reserved,
      available: item.stock - item.reserved,
    })),
  };
}
}