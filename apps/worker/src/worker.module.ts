import { Module } from '@nestjs/common';

// BullMQ processors (ingestion, re-indexing, eval runs) are registered here from Phase 2.
@Module({})
export class WorkerModule {}
