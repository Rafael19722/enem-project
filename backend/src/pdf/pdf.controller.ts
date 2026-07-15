import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GeneratePdfDto } from './dto/generate-pdf.dto';
import { PdfService } from './pdf.service';

@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Post('questions')
  async generateQuestionsPdf(
    @Body() dto: GeneratePdfDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="questoes-enem.pdf"',
    );
    await this.pdfService.streamQuestionsPdf(dto.questions, res);
  }
}
