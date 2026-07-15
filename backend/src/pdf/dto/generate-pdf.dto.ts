import { ArrayMaxSize, ArrayMinSize, IsArray } from 'class-validator';
import { Question } from '../../common/question.interface';

export class GeneratePdfDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(45)
  questions!: Question[];
}
