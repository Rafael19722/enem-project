import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExamsModule } from './exams/exams.module';
import { PdfModule } from './pdf/pdf.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ExamsModule,
    PdfModule,
  ],
})
export class AppModule {}
