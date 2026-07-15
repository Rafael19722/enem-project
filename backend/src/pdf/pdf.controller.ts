import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ExamsService } from '../exams/exams.service';
import { GeneratePdfDto } from './dto/generate-pdf.dto';
import { PdfService } from './pdf.service';

@Controller('pdf')
export class PdfController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly examsService: ExamsService,
  ) {}

  @Post('questions')
  async generateQuestionsPdf(
    @Body() dto: GeneratePdfDto,
    @Res() res: Response,
  ): Promise<void> {
    const questions = await this.examsService.getQuestionsByRef(dto.refs);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="simulado-enem.pdf"',
    );
    await this.pdfService.streamQuestionsPdf(questions, res);
  }
}
