import { Module } from '@nestjs/common';
import { SharedController } from './shared.controller.js';
import { SharedService } from './shared.service.js';

@Module({ controllers: [SharedController], providers: [SharedService] })
export class SharedModule {}
