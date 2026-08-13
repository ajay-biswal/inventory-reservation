import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutScheduler } from './checkout.scheduler.js';

@Module({
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    CheckoutScheduler
  ]
})
export class CheckoutModule {}
