import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';

@Module({
  imports: [ExamsModule],
  controllers: [PdfController],
  providers: [PdfService],
})
export class PdfModule {}
