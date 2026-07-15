import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Discipline, Question } from '../common/question.interface';
import { DrawQuestionsDto } from './dto/draw-questions.dto';
import { ExamsService } from './exams.service';

/**
 * Removes the answer from a question. The browser only renders previews, and
 * the PDF is built server-side from refs, so nothing downstream needs these.
 */
function withoutAnswers(question: Question): Question {
  return {
    ...question,
    correctAlternative: undefined,
    alternatives: question.alternatives.map((alt) => ({
      letter: alt.letter,
      text: alt.text,
      file: alt.file,
    })),
  };
}

@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get('years')
  getYears(): Promise<number[]> {
    return this.examsService.getYears();
  }

  @Get(':year/disciplines')
  getDisciplines(
    @Param('year', ParseIntPipe) year: number,
  ): Promise<Discipline[]> {
    return this.examsService.getDisciplines(year);
  }

  @Post('draw')
  async drawQuestions(@Body() dto: DrawQuestionsDto): Promise<Question[]> {
    const questions = await this.examsService.drawQuestions(dto.selections);
    return questions.map(withoutAnswers);
  }
}
