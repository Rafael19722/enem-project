import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SelectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1998)
  @Max(2100)
  year!: number;

  /** Discipline value, e.g. "matematica", "ciencias-humanas", "ingles". */
  @IsString()
  @MinLength(1)
  discipline!: string;

  /** How many questions to randomly pick. Capped at the discipline size. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(45)
  amount: number = 5;
}

export class DrawQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => SelectionDto)
  selections!: SelectionDto[];
}
