import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { CheckoutService } from './checkout.service.js';
import { PrismaService } from '../database/prisma.service.js';

const checkoutFindUnique = jest.fn<() => Promise<any | null>>();
const productFindUnique = jest.fn<() => Promise<any | null>>();

const inventoryFindMany = jest.fn<() => Promise<any[]>>();
const inventoryUpdate = jest.fn<() => Promise<any>>();

const reservationCreate = jest.fn<() => Promise<any>>();
const reservationUpdate = jest.fn<() => Promise<any>>();

const checkoutCreate = jest.fn<() => Promise<any>>();
const checkoutUpdate = jest.fn<() => Promise<any>>();

const queryRaw = jest.fn<() => Promise<any>>();

const transaction =
  jest.fn<(callback: (tx: any) => Promise<any>) => Promise<any>>();

describe('CheckoutService', () => {
  let service: CheckoutService;
   
  
  

beforeEach(async () => {
  const module: TestingModule =
    await Test.createTestingModule({
      providers: [
        CheckoutService,

        {
          provide: PrismaService,

          useValue: {
  checkout: {
    findUnique: checkoutFindUnique,
    create: checkoutCreate,
  },

  product: {
    findUnique: productFindUnique,
  },

  inventory: {
    findMany: inventoryFindMany,
    update: inventoryUpdate,
  },

  reservation: {
    create: reservationCreate,
    update: reservationUpdate,
  },

  $transaction: transaction,
},
        },
      ],
    }).compile();

  service = module.get<CheckoutService>(CheckoutService);
});

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw if product does not exist', async () => {
  const dto = {
    productId: '550e8400-e29b-41d4-a716-446655440000',
    quantity: 2,
    deliveryPincode: '751001',
    deliveryCity: 'Bhubaneswar',
    deliveryState: 'Odisha',
  };

  const idempotencyKey = 'test-idempotency-key';

    checkoutFindUnique.mockResolvedValue(null);
    productFindUnique.mockResolvedValue(null);

  await expect(
    service.createCheckout(dto, idempotencyKey),
  ).rejects.toThrow('Product not found');
});

  it('should return existing checkout for the same idempotency key', async () => {
  const dto = {
    productId: '550e8400-e29b-41d4-a716-446655440000',
    quantity: 2,
    deliveryPincode: '751001',
    deliveryCity: 'Bhubaneswar',
    deliveryState: 'Odisha',
  };

  const idempotencyKey = 'test-idempotency-key';

  const payload = JSON.stringify({
    productId: dto.productId,
    quantity: dto.quantity,
    deliveryPincode: dto.deliveryPincode,
    deliveryCity: dto.deliveryCity,
    deliveryState: dto.deliveryState,
  });

  const payloadHash = createHash('sha256')
    .update(payload)
    .digest('hex');

  const existingCheckout = {
    id: 'checkout-123',
    idempotencyKey,
    payloadHash,
    productId: dto.productId,
    quantity: dto.quantity,
    locationId: 'location-123',
    deliveryPincode: dto.deliveryPincode,
    deliveryCity: dto.deliveryCity,
    deliveryState: dto.deliveryState,
    status: 'RESERVED',
  };

  checkoutFindUnique.mockResolvedValue(existingCheckout);

  const result = await service.createCheckout(dto, idempotencyKey);

  expect(result).toEqual(existingCheckout);
});

  it('should throw if idempotency key is reused with a different payload', async () => {
  const dto = {
    productId: '550e8400-e29b-41d4-a716-446655440000',
    quantity: 2,
    deliveryPincode: '751001',
    deliveryCity: 'Bhubaneswar',
    deliveryState: 'Odisha',
  };

  const idempotencyKey = 'test-idempotency-key';

  const existingCheckout = {
    id: 'checkout-123',
    idempotencyKey,
    payloadHash: 'some-different-hash',
  };

  checkoutFindUnique.mockResolvedValue(existingCheckout);

  await expect(
    service.createCheckout(dto, idempotencyKey),
  ).rejects.toThrow(
    'Idempotency key was already used with a different payload',
  );

  expect(productFindUnique).not.toHaveBeenCalled();
});


   it('should create checkout and reserve inventory successfully', async () => {
  const dto = {
    productId: '550e8400-e29b-41d4-a716-446655440000',
    quantity: 2,
    deliveryPincode: '751001',
    deliveryCity: 'Bhubaneswar',
    deliveryState: 'Odisha',
  };

  const idempotencyKey = 'new-checkout-key';

  // 1. No existing checkout
  checkoutFindUnique.mockResolvedValue(null);

  // 2. Product exists
  productFindUnique.mockResolvedValue({
    id: dto.productId,
    name: 'Test Product',
  });

  // 3. Candidate inventory location
  inventoryFindMany.mockResolvedValue([
    {
      id: 'inventory-123',
      productId: dto.productId,
      locationId: 'location-123',
      stock: 10,
      reserved: 2,
      location: {
        id: 'location-123',
        city: 'Bhubaneswar',
        state: 'Odisha',
        priority: 1,
        serviceZones: [
          {
            pincode: '751001',
          },
        ],
      },
    },
  ]);

  // 4. Row lock returns inventory
  queryRaw.mockResolvedValue([
    {
      id: 'inventory-123',
      stock: 10,
      reserved: 2,
    },
  ]);

  inventoryUpdate.mockResolvedValue({
    id: 'inventory-123',
  });

  reservationCreate.mockResolvedValue({
    id: 'reservation-123',
  });

  const createdCheckout = {
    id: 'checkout-123',
    productId: dto.productId,
    quantity: dto.quantity,
    locationId: 'location-123',
    idempotencyKey,
    status: 'RESERVED',
  };

  checkoutCreate.mockResolvedValue(createdCheckout);

  // 5. Make $transaction execute the callback
  transaction.mockImplementation(async (callback:any) => {
    return callback({
      $queryRaw: queryRaw,
      inventory: {
        update: inventoryUpdate,
      },
      checkout: {
        findUnique: checkoutFindUnique,
        create: checkoutCreate,
        update: checkoutUpdate
      },
      reservation: {
        create: reservationCreate,
      },
    });
  });

  // 6. Execute
  const result = await service.createCheckout(
    dto,
    idempotencyKey,
  );

  // 7. Assertions
  expect(result).toEqual(createdCheckout);

  expect(inventoryUpdate).toHaveBeenCalled();

  expect(checkoutCreate).toHaveBeenCalled();

  expect(reservationCreate).toHaveBeenCalled();
});

it('should throw if inventory stock is insufficient', async () => {
  const dto = {
    productId: '550e8400-e29b-41d4-a716-446655440000',
    quantity: 20,
    deliveryPincode: '751001',
    deliveryCity: 'Bhubaneswar',
    deliveryState: 'Odisha',
  };

  const idempotencyKey = 'insufficient-stock-key';

  checkoutFindUnique.mockResolvedValue(null);

  productFindUnique.mockResolvedValue({
    id: dto.productId,
    name: 'Test Product',
  });

  inventoryFindMany.mockResolvedValue([
    {
      id: 'inventory-123',
      productId: dto.productId,
      locationId: 'location-123',
      stock: 5,
      reserved: 2,
      location: {
        id: 'location-123',
        city: 'Bhubaneswar',
        state: 'Odisha',
        priority: 1,
        serviceZones: [{ pincode: '751001' }],
      },
    },
  ]);

  await expect(
    service.createCheckout(dto, idempotencyKey),
  ).rejects.toThrow();
});

it('should throw if no inventory location is available', async () => {
  const dto = {
    productId: '550e8400-e29b-41d4-a716-446655440000',
    quantity: 2,
    deliveryPincode: '751001',
    deliveryCity: 'Bhubaneswar',
    deliveryState: 'Odisha',
  };

  checkoutFindUnique.mockResolvedValue(null);

  productFindUnique.mockResolvedValue({
    id: dto.productId,
    name: 'Test Product',
  });

  inventoryFindMany.mockResolvedValue([]);

  await expect(
    service.createCheckout(dto, 'no-inventory-key'),
  ).rejects.toThrow();
});


  it('should propagate transaction failure', async () => {
  const dto = {
    productId: '550e8400-e29b-41d4-a716-446655440000',
    quantity: 2,
    deliveryPincode: '751001',
    deliveryCity: 'Bhubaneswar',
    deliveryState: 'Odisha',
  };

  checkoutFindUnique.mockResolvedValue(null);

  productFindUnique.mockResolvedValue({
    id: dto.productId,
    name: 'Test Product',
  });

  inventoryFindMany.mockResolvedValue([
    {
      id: 'inventory-123',
      productId: dto.productId,
      locationId: 'location-123',
      stock: 10,
      reserved: 2,
      location: {
        id: 'location-123',
        city: 'Bhubaneswar',
        state: 'Odisha',
        priority: 1,
        serviceZones: [{ pincode: '751001' }],
      },
    },
  ]);

  transaction.mockRejectedValueOnce(new Error('Database transaction failed'));

  await expect(
    service.createCheckout(dto, 'transaction-failure-key'),
  ).rejects.toThrow('Database transaction failed');
});

it('should keep inventory reserved when checkout is abandoned', async () => {
  const checkoutId = 'checkout-123';

  checkoutFindUnique.mockResolvedValue({
    id: checkoutId,
    status: 'RESERVED',
  });

  const result = await service.abandonCheckout(checkoutId);

  expect(result.status).toBe('ABANDONED');

  expect(inventoryUpdate).not.toHaveBeenCalled();
  expect(reservationUpdate).not.toHaveBeenCalled();

  expect(checkoutUpdate).toHaveBeenCalledWith({
    where: {
      id: checkoutId,
    },
    data: {
      status: 'ABANDONED',
    },
  });
});
  
});
