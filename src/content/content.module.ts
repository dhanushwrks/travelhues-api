import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StoreModule } from '../store/store.module.js';
import { ContentController } from './content.controller.js';
import { ContentService } from './content.service.js';

@Module({
  imports: [StoreModule, AuthModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
