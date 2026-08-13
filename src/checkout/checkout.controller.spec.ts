import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { CreateCheckoutDto } from './dto/create-checkout.dto.js';
import { PaymentResultDto } from './dto/payment-result.dto.js';
describe('CheckoutController', () => {
  let controller: CheckoutController;
  let checkoutService: jest.Mocked<CheckoutService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckoutController],
      providers: [
  {
    provide: CheckoutService,
    useValue: {
    createCheckout: jest.fn(),
    processPayment: jest.fn(),
    expireCheckout: jest.fn(),
   },
  },
],
    }).compile();

    controller = module.get<CheckoutController>(CheckoutController);

    checkoutService = module.get<CheckoutService>(
    CheckoutService,
    ) as jest.Mocked<CheckoutService>;

    
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });


  it('should throw if idempotency key is missing', async () => {
  await expect(
    controller.createCheckout(
      {} as any,
      undefined,
    ),
  ).rejects.toThrow('Idempotency-Key header is required');
});

  it('should create a checkout', async () => {
    const dto: CreateCheckoutDto = {
      productId: '550e8400-e29b-41d4-a716-446655440000',
      quantity: 2,
      deliveryPincode: '751001',
      deliveryCity: 'Bhubaneswar',
      deliveryState: 'Odisha',
    };

    const idempotencyKey = 'test-key-123';

    await controller.createCheckout(dto, idempotencyKey);

    expect(checkoutService.createCheckout).toHaveBeenCalledWith(
      dto,
      idempotencyKey,
    );
  });

  it('should process payment', async () => {
  const checkoutId = 'checkout-123';

  const dto: PaymentResultDto = {
    success: true,
  };

  await controller.processPayment(checkoutId, dto);

  expect(checkoutService.processPayment).toHaveBeenCalledWith(
    checkoutId,
    true,
  );
});

it('should process failed payment', async () => {
  const checkoutId = 'checkout-123';

  const dto: PaymentResultDto = {
    success: false,
  };

  await controller.processPayment(checkoutId, dto);

  expect(checkoutService.processPayment).toHaveBeenCalledWith(
    checkoutId,
    false,
  );
});

it('should expire a checkout', async () => {
  const checkoutId = 'checkout-123';

  await controller.expireCheckout(checkoutId);

  expect(checkoutService.expireCheckout).toHaveBeenCalledWith(
    checkoutId,
  );
});

it('should return the checkout created by the service', async () => {
  const dto: CreateCheckoutDto = {
    productId: '550e8400-e29b-41d4-a716-446655440000',
    quantity: 2,
    deliveryPincode: '751001',
    deliveryCity: 'Bhubaneswar',
    deliveryState: 'Odisha',
  };

  const idempotencyKey = 'idem-123';

  const expectedResult = {
    id: 'checkout-123',
    status: 'PENDING',
  };

  checkoutService.createCheckout.mockResolvedValue(expectedResult as any);

  const result = await controller.createCheckout(dto, idempotencyKey);

  expect(result).toEqual(expectedResult);
});
});
