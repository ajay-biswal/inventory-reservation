import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { CreateCheckoutDto } from './dto/create-checkout.dto.js';

const PAYMENT_RETRY_WINDOW_MS = 15 * 60 * 1000;

type CandidateInventory = {
  id: string;
  productId: string;
  locationId: string;
  stock: number;
  reserved: number;
  priority: number;
  tier: number;
};

type LockedInventory = {
  id: string;
  stock: number;
  reserved: number;
};

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async createCheckout(
    dto: CreateCheckoutDto,
    idempotencyKey: string,
  ) {
    const payloadHash = this.createPayloadHash(dto);

    /*
     * Fast path:
     *
     * If the idempotency key already exists, we don't need
     * to perform location selection or reservation again.
     */
    const existingCheckout =
      await this.prisma.checkout.findUnique({
        where: {
          idempotencyKey,
        },
      });

    if (existingCheckout) {
      if (existingCheckout.payloadHash !== payloadHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different payload',
        );
      }

      return existingCheckout;
    }

    const product = await this.prisma.product.findUnique({
      where: {
        id: dto.productId,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const candidates =
      await this.findCandidateLocations(dto);

    if (candidates.length === 0) {
      throw new UnprocessableEntityException(
        'No active location has inventory for this product',
      );
    }

    /*
     * Try candidates in preference order.
     *
     * The candidate list is only a ranking.
     * The actual availability decision happens AFTER
     * acquiring the row lock inside reserveFromLocation().
     */
    for (const candidate of candidates) {
      try {
        return await this.reserveFromLocation(
          dto,
          idempotencyKey,
          payloadHash,
          candidate.locationId,
        );
      } catch (error) {
        if (error instanceof InsufficientInventoryError) {
          continue;
        }

        /*
         * Another request may have won the idempotency race.
         */
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const existing =
            await this.prisma.checkout.findUnique({
              where: {
                idempotencyKey,
              },
            });

          if (!existing) {
            throw error;
          }

          if (existing.payloadHash !== payloadHash) {
            throw new ConflictException(
              'Idempotency key was already used with a different payload',
            );
          }

          return existing;
        }

        throw error;
      }
    }

    throw new UnprocessableEntityException(
      'Insufficient inventory to fulfill the requested quantity',
    );
  }

  private async findCandidateLocations(
    dto: CreateCheckoutDto,
  ): Promise<CandidateInventory[]> {
    const inventories =
      await this.prisma.inventory.findMany({
        where: {
          productId: dto.productId,
          location: {
            active: true,
          },
        },
        include: {
          location: {
            include: {
              serviceZones: true,
            },
          },
        },
      });

    return inventories
      .map((inventory) => {
        const servesPincode =
          inventory.location.serviceZones.some(
            (zone) =>
              zone.pincode === dto.deliveryPincode,
          );

        const sameCity =
          inventory.location.city.toLowerCase() ===
          dto.deliveryCity.toLowerCase();

        const sameState =
          inventory.location.state.toLowerCase() ===
          dto.deliveryState.toLowerCase();

        let tier = 3;

        if (servesPincode) {
          tier = 0;
        } else if (sameCity) {
          tier = 1;
        } else if (sameState) {
          tier = 2;
        }

        return {
          id: inventory.id,
          productId: inventory.productId,
          locationId: inventory.locationId,
          stock: inventory.stock,
          reserved: inventory.reserved,
          priority: inventory.location.priority,
          tier,
        };
      })
      .sort((a, b) => {
        if (a.tier !== b.tier) {
          return a.tier - b.tier;
        }

        return a.priority - b.priority;
      });
  }

  private async reserveFromLocation(
    dto: CreateCheckoutDto,
    idempotencyKey: string,
    payloadHash: string,
    locationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      /*
       * THIS IS THE CRITICAL PART.
       *
       * PostgreSQL locks this inventory row until
       * the transaction commits or rolls back.
       */
      const rows = await tx.$queryRaw<
        LockedInventory[]
      >(Prisma.sql`
        SELECT
          "id",
          "stock",
          "reserved"
        FROM "Inventory"
        WHERE "productId" = ${dto.productId}
          AND "locationId" = ${locationId}
        FOR UPDATE
      `);

      if (rows.length === 0) {
        throw new InsufficientInventoryError();
      }

      const inventory = rows[0];

      const available =
        inventory.stock - inventory.reserved;

      /*
       * IMPORTANT:
       *
       * We calculate availability AFTER acquiring
       * the row lock.
       */
      if (available < dto.quantity) {
        throw new InsufficientInventoryError();
      }

      const expiresAt = new Date(
        Date.now() + PAYMENT_RETRY_WINDOW_MS,
      );

      /*
       * We now own the inventory row.
       *
       * No competing transaction can modify this row
       * until this transaction finishes.
       */
      await tx.inventory.update({
        where: {
          id: inventory.id,
        },
        data: {
          reserved: {
            increment: dto.quantity,
          },
        },
      });

      const checkout = await tx.checkout.create({
        data: {
          productId: dto.productId,
          quantity: dto.quantity,
          locationId,

          idempotencyKey,
          payloadHash,

          deliveryPincode: dto.deliveryPincode,
          deliveryCity: dto.deliveryCity,
          deliveryState: dto.deliveryState,

          status: 'RESERVED',
          expiresAt,
        },
      });

      await tx.reservation.create({
        data: {
          checkoutId: checkout.id,
          quantity: dto.quantity,
          status: 'ACTIVE',
        },
      });

      return checkout;
    });
  }

  private createPayloadHash(
    dto: CreateCheckoutDto,
  ): string {
    const payload = JSON.stringify({
      productId: dto.productId,
      quantity: dto.quantity,
      deliveryPincode: dto.deliveryPincode,
      deliveryCity: dto.deliveryCity,
      deliveryState: dto.deliveryState,
    });

    return createHash('sha256')
      .update(payload)
      .digest('hex');
  }

  async processPayment(
  checkoutId: string,
  success: boolean,
) {
  return this.prisma.$transaction(async (tx) => {
    const checkout = await tx.checkout.findUnique({
      where: {
        id: checkoutId,
      },
      include: {
        reservation: true,
      },
    });

    if (!checkout) {
      throw new NotFoundException('Checkout not found');
    }

    /*
     * Payment should only be processed while
     * the checkout is RESERVED.
     */
    if (checkout.status !== 'RESERVED') {
      throw new ConflictException(
        `Checkout is already ${checkout.status}`,
      );
    }

    if (!checkout.reservation) {
      throw new ConflictException(
        'Checkout has no active reservation',
      );
    }

    /*
     * PAYMENT SUCCESS
     */
    if (success) {
      await tx.inventory.update({
        where: {
          productId_locationId: {
            productId: checkout.productId,
            locationId: checkout.locationId,
          },
        },
        data: {
          stock: {
            decrement: checkout.quantity,
          },
          reserved: {
            decrement: checkout.quantity,
          },
        },
      });

      await tx.reservation.update({
        where: {
          checkoutId,
        },
        data: {
          status: 'CONSUMED',
        },
      });

      return tx.checkout.update({
        where: {
          id: checkoutId,
        },
        data: {
          status: 'SUCCESSFUL',
        },
      });
    }

    /*
     * PAYMENT FAILURE
     *
     * Give the reserved inventory back.
     */
    await tx.inventory.update({
      where: {
        productId_locationId: {
          productId: checkout.productId,
          locationId: checkout.locationId,
        },
      },
      data: {
        reserved: {
          decrement: checkout.quantity,
        },
      },
    });

    await tx.reservation.update({
      where: {
        checkoutId,
      },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });

    return tx.checkout.update({
      where: {
        id: checkoutId,
      },
      data: {
        status: 'FAILED',
      },
    });
  });
}

  async expireCheckout(checkoutId: string) {
  return this.prisma.$transaction(async (tx) => {
    /*
     * Claim the checkout first.
     *
     * Only a RESERVED checkout can expire.
     * This also protects us from a race with payment.
     */
    const result = await tx.checkout.updateMany({
      where: {
        id: checkoutId,
        status: 'RESERVED',
        expiresAt: {
          lte: new Date(),
        },
      },
      data: {
        status: 'EXPIRED',
        expiresAt: null,
      },
    });

    /*
     * Someone else already processed this checkout,
     * or it hasn't expired yet.
     */
    if (result.count === 0) {
      return null;
    }

    const checkout = await tx.checkout.findUnique({
      where: {
        id: checkoutId,
      },
      include: {
        reservation: true,
      },
    });

    if (!checkout || !checkout.reservation) {
      throw new ConflictException(
        'Checkout reservation not found',
      );
    }

    /*
     * Release the reserved inventory.
     */
    await tx.inventory.update({
      where: {
        productId_locationId: {
          productId: checkout.productId,
          locationId: checkout.locationId,
        },
      },
      data: {
        reserved: {
          decrement: checkout.quantity,
        },
      },
    });

    /*
     * Release the reservation.
     */
    await tx.reservation.update({
      where: {
        checkoutId,
      },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });

    return tx.checkout.findUnique({
      where: {
        id: checkoutId,
      },
      include: {
        reservation: true,
      },
    });
  });
}

async expireExpiredCheckouts() {
  const expiredCheckouts = await this.prisma.checkout.findMany({
    where: {
      status: 'RESERVED',
      expiresAt: {
        lte: new Date(),
      },
    },
    select: {
      id: true,
    },
  });

  let expiredCount = 0;

  for (const checkout of expiredCheckouts) {
    const result = await this.expireCheckout(checkout.id);

    if (result) {
      expiredCount++;
    }
  }

  return expiredCount;
}
}

class InsufficientInventoryError extends Error {
  constructor() {
    super('Insufficient inventory');
  }
}