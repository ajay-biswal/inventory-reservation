import { Controller, Param, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
    constructor(
        private readonly paymentService: PaymentsService,
    ){}

    @Post('checkouts/:checkoutId/order')
    createOrder(
        @Param('checkoutId') checkoutId: string,
    ){
        return this .paymentService.createOrder(checkoutId);
    }
}
