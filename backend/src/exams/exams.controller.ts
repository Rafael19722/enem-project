import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { Discipline, Question } from '../common/question.interface';
import { GetQuestionsQueryDto } from './dto/get-questions-query.dto';
import { ExamsService } from './exams.service';

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

  @Get(':year/questions')
  getQuestions(
    @Param('year', ParseIntPipe) year: number,
    @Query() query: GetQuestionsQueryDto,
  ): Promise<Question[]> {
    return this.examsService.getRandomQuestions(
      year,
      query.discipline,
      query.amount,
    );
  }
}
