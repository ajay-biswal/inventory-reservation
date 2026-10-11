import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import { RazorpayService } from './razorpay.service.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpayService: RazorpayService,
    private readonly configService: ConfigService,
  ) {}

  async createOrder(checkoutId: string) {
    const checkout = await this.prisma.checkout.findUnique({
      where: { id: checkoutId },
      include: { payment: true },
    });

    if (!checkout) {
      throw new NotFoundException('Checkout not found');
    }

    if (checkout.status !== 'RESERVED') {
      throw new ConflictException(
        `Checkout is ${checkout.status}, not reserved`,
      );
    }

    const amountPaise = checkout.unitPricePaise * checkout.quantity;

    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new ConflictException('Invalid checkout amount');
    }

    if (checkout.payment?.providerOrderId) {
      return {
        paymentId: checkout.payment.id,
        orderId: checkout.payment.providerOrderId,
        amount: checkout.payment.amountPaise,
        currency: checkout.payment.currency,
      };
    }

    const payment =
      checkout.payment ??
      (await this.prisma.payment.create({
        data: {
          checkoutId: checkout.id,
          amountPaise,
          currency: 'INR',
          provider: 'RAZORPAY',
          status: 'PENDING',
        },
      }));

    if (payment.amountPaise !== amountPaise) {
      throw new ConflictException(
        'Stored payment amount doesnot match checkout amount',
      );
    }

    const order = await this.razorpayService.createOrder(
      amountPaise,
      checkout.id,
    );

    const updatePayment = await this.prisma.payment.update({
        where:{id: payment.id},
        data:{
            providerOrderId: order.id,
            status: 'CREATED',
        },
    });

    return {
        paymentId: updatePayment,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: this.configService.getOrThrow<string>(
            'RAZORPAY_KEY_ID'
        )
    }
  }
}
