import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { StoreModule } from '../store/store.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TccGuard } from './tcc.guard.js';
import { UserGuard } from './user.guard.js';

@Module({
  imports: [AdminModule, StoreModule],
  controllers: [AuthController],
  providers: [AuthService, UserGuard, TccGuard],
  exports: [AuthService, UserGuard, TccGuard, AdminModule],
})
export class AuthModule {}
