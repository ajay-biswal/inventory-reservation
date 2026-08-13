import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import request from 'supertest';

describe('Checkout concurrency', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let productId: string;
  let locationId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    await app.init();

    prisma = moduleRef.get(PrismaService);

    /*
     * Create a product specifically for this test.
     */
    const product = await prisma.product.create({
      data: {
        name: `Concurrency Test Product ${Date.now()}`,
      },
    });

    productId = product.id;

    /*
     * Create an active warehouse.
     */
    const location = await prisma.location.create({
      data: {
        name: `Concurrency Warehouse ${Date.now()}`,
        city: 'Bengaluru',
        state: 'Karnataka',
        priority: 1,
        active: true,
      },
    });

    locationId = location.id;

    /*
     * Create inventory:
     *
     * stock = 10
     * reserved = 0
     */
    await prisma.inventory.create({
      data: {
        productId,
        locationId,
        stock: 10,
        reserved: 0,
      },
    });

    /*
     * Make the warehouse serve the test pincode.
     */
    await prisma.serviceZone.create({
      data: {
        locationId,
        pincode: '560001',
      },
    });
  });

  afterAll(async () => {
    /*
     * Delete test data.
     */
    await prisma.reservation.deleteMany({
      where: {
        checkout: {
          productId,
        },
      },
    });

    await prisma.checkout.deleteMany({
      where: {
        productId,
      },
    });

    await prisma.inventory.deleteMany({
      where: {
        productId,
      },
    });

    await prisma.serviceZone.deleteMany({
      where: {
        locationId,
      },
    });

    await prisma.location.delete({
      where: {
        id: locationId,
      },
    });

    await prisma.product.delete({
      where: {
        id: productId,
      },
    });

    await app.close();
  });

  it('should never reserve more inventory than available during concurrent checkouts', async () => {
    const payload = {
      productId,
      quantity: 7,
      deliveryPincode: '560001',
      deliveryCity: 'Bengaluru',
      deliveryState: 'Karnataka',
    };

    /*
     * Two different idempotency keys are important.
     *
     * If we used the same key, we'd be testing idempotency
     * rather than concurrency.
     */
    const requestA = request(app.getHttpServer())
  .post('/checkouts')
  .set(
    'Idempotency-Key',
    `concurrent-a-${Date.now()}`,
  )
  .send(payload);

    const requestB = request(app.getHttpServer())
  .post('/checkouts')
  .set(
    'Idempotency-Key',
    `concurrent-b-${Date.now()}`,
  )
  .send(payload);

    const [responseA, responseB] = await Promise.all([
  requestA,
  requestB,
]);

/*
 * Exactly one request should succeed.
 */
const statuses = [responseA.status, responseB.status].sort();

expect(statuses).toEqual([201, 422]);

/*
 * Check the actual database state.
 */
const inventory = await prisma.inventory.findUnique({
  where: {
    productId_locationId: {
      productId,
      locationId,
    },
  },
});

    expect(inventory).not.toBeNull();

    /*
     * Only one checkout could reserve 7.
     */
    expect(inventory!.reserved).toBe(7);

    /*
     * Stock itself hasn't been consumed yet.
     */
    expect(inventory!.stock).toBe(10);

    /*
     * Therefore:
     *
     * available = 10 - 7 = 3
     */
    expect(
      inventory!.stock - inventory!.reserved,
    ).toBe(3);
  });
});