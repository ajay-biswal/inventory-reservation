import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CheckoutService } from './checkout.service.js';

@Injectable()
export class CheckoutScheduler {
  private readonly logger = new Logger(CheckoutScheduler.name);

  constructor(
    private readonly checkoutService: CheckoutService,
  ) {}

  @Cron('* * * * *')
  async expireCheckouts() {
    this.logger.log('Running checkout expiry job...');

    const expiredCount =
      await this.checkoutService.expireExpiredCheckouts();

    this.logger.log(
      `Checkout expiry job completed. Expired: ${expiredCount}`,
    );
  }
}