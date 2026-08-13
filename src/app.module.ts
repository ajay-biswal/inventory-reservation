import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { ProductModule } from './product/product.module.js';
import { LocationModule } from './location/location.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { CheckoutModule } from './checkout/checkout.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    ProductModule,
    LocationModule,
    InventoryModule,
    CheckoutModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}