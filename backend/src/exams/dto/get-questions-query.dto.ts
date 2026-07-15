import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';

export class GetQuestionsQueryDto {
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
