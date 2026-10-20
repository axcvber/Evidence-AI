import { Module } from '@nestjs/common';
import { DevMocksController } from './dev-mocks.controller.js';

@Module({ controllers: [DevMocksController] })
export class DevMocksModule {}
