import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BookmarksModule } from './bookmarks/bookmarks.module.js';
import { CollectionsModule } from './collections/collections.module.js';
import { CommonModule } from './common/common.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SharedModule } from './shared/shared.module.js';
import { SharesModule } from './shares/shares.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [CommonModule, PrismaModule, AuthModule, UsersModule, CollectionsModule, BookmarksModule, SharesModule, SharedModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
