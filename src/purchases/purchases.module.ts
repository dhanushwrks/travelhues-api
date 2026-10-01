import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StoreModule } from '../store/store.module.js';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesService } from './purchases.service.js';

@Module({
  imports: [StoreModule, AuthModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
