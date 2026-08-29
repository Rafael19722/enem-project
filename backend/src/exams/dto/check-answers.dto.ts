import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AnswerDto {
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

  @IsOptional()
  @IsIn(['A', 'B', 'C', 'D', 'E'])
  letter!: string | null;
}

export class CheckAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(180)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];
}
