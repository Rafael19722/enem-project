import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Discipline } from '../common/question.interface';
import { CheckAnswersDto } from './dto/check-answers.dto';
import { DrawQuestionsDto } from './dto/draw-questions.dto';
import { ExamQuestion, toExamQuestion } from './exam-question.dto';
import { AnswerResult, ExamsService } from './exams.service';

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
  async drawQuestions(@Body() dto: DrawQuestionsDto): Promise<ExamQuestion[]> {
    const questions = await this.examsService.drawQuestions(dto.selections);
    return questions.map(toExamQuestion);
  }

  /**
   * Grades answers server-side so the key never sits in the page while someone
   * is still working through the questions. This is not anti-cheat: the reply
   * has to name the right alternative for the review screen to teach anything,
   * so it can be farmed by whoever means to. It stops accidental spoilers, and
   * with no ranking or public score that is the failure worth preventing.
   */
  @Post('check')
  checkAnswers(@Body() dto: CheckAnswersDto): Promise<AnswerResult[]> {
    return this.examsService.checkAnswers(dto.answers);
  }
}
