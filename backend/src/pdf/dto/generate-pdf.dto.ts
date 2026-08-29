import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuestionRefDto {
  @Type(() => Number)
  @IsInt()
  @Min(1998)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  index!: number;
}

export class GeneratePdfDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(180)
  @ValidateNested({ each: true })
  @Type(() => QuestionRefDto)
  refs!: QuestionRefDto[];
}
