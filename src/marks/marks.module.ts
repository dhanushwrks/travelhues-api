import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StoreModule } from '../store/store.module.js';
import { MarksController } from './marks.controller.js';
import { MarksService } from './marks.service.js';

@Module({
  imports: [StoreModule, AuthModule],
  controllers: [MarksController],
  providers: [MarksService],
})
export class MarksModule {}
