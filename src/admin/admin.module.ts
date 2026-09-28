import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [StoreModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
