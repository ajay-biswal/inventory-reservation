import {
  Body,
  Controller,
  Param,
  Headers,
  Post,
  BadRequestException,
} from '@nestjs/common';

import { PaymentResultDto } from './dto/payment-result.dto.js';

import { CreateCheckoutDto } from './dto/create-checkout.dto.js';
import { CheckoutService } from './checkout.service.js';

@Controller('checkouts')
export class CheckoutController {
  constructor(
    private readonly checkoutService: CheckoutService,
  ) {}

  @Post()
  async createCheckout(
    @Body() dto: CreateCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'Idempotency-Key header is required',
      );
    }

    return this.checkoutService.createCheckout(
      dto,
      idempotencyKey,
    );
  }


    @Post(':checkoutId/payment')
    async processPayment(
      @Param('checkoutId') checkoutId: string,
      @Body() dto: PaymentResultDto,
    ) {
      return this.checkoutService.processPayment(
        checkoutId,
        dto.success,
      );
    }

    @Post(':checkoutId/expire')
async expireCheckout(
  @Param('checkoutId') checkoutId: string,
) {
  return this.checkoutService.expireCheckout(checkoutId);
}
}