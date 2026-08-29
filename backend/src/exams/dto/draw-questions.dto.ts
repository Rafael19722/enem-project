import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const DISCIPLINES = [
  'linguagens',
  'ciencias-humanas',
  'ciencias-natureza',
  'matematica',
  'ingles',
  'espanhol',
] as const;

export class SelectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1998)
  @Max(2100)
  year!: number;

  @IsIn(DISCIPLINES)
  discipline!: (typeof DISCIPLINES)[number];

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
