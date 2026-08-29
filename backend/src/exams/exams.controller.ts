import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Discipline } from '../common/question';
import { CheckAnswersDto } from './dto/check-answers.dto';
import { DrawQuestionsDto } from './dto/draw-questions.dto';
import { ExamQuestion, toExamQuestion } from './dto/exam-question.dto';
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

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('draw')
  async drawQuestions(@Body() dto: DrawQuestionsDto): Promise<ExamQuestion[]> {
    const questions = await this.examsService.drawQuestions(dto.selections);
    return questions.map(toExamQuestion);
  }

  @Throttle({ default: { ttl: 60_000, limit: 150 } })
  @Post('check')
  checkAnswers(@Body() dto: CheckAnswersDto): Promise<AnswerResult[]> {
    return this.examsService.checkAnswers(dto.answers);
  }
}
