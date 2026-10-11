
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayService {
  private readonly razorpay: Razorpay;

  constructor(configService: ConfigService) {
    const keyId = configService.get<string>('RAZORPAY_KEY_ID');
    const keySecret = configService.get<string>('RAZORPAY_KEY_SECRET');

    if (!keyId || !keySecret) {
      throw new InternalServerErrorException(
        'Razorpay credentials are not configured',
      );
    }

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  async createOrder(amountPaise: number, receipt: string) {
    return this.razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
    });
  }
}
