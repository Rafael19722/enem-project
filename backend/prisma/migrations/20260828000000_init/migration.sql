-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "exams" (
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "disciplines" JSONB NOT NULL,
    "languages" JSONB NOT NULL,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "discipline_blocks" (
    "year" INTEGER NOT NULL,
    "discipline" TEXT NOT NULL,
    "start_index" INTEGER NOT NULL,
    "end_index" INTEGER NOT NULL,

    CONSTRAINT "discipline_blocks_pkey" PRIMARY KEY ("year","discipline")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "language" TEXT,
    "title" TEXT NOT NULL,
    "discipline" TEXT,
    "block_discipline" TEXT,
    "context" TEXT,
    "alternatives_introduction" TEXT,
    "correct_alternative" TEXT,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_files" (
    "question_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "question_files_pkey" PRIMARY KEY ("question_id","position")
);

-- CreateTable
CREATE TABLE "alternatives" (
    "question_id" INTEGER NOT NULL,
    "letter" TEXT NOT NULL,
    "text" TEXT,
    "file" TEXT,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "alternatives_pkey" PRIMARY KEY ("question_id","letter")
);

-- CreateIndex
CREATE INDEX "questions_draw_pool" ON "questions"("year", "block_discipline", "index");

-- CreateIndex
CREATE INDEX "questions_by_ref" ON "questions"("year", "index");

-- CreateIndex
CREATE UNIQUE INDEX "questions_year_index_language_key" ON "questions"("year", "index", "language");

-- AddForeignKey
ALTER TABLE "discipline_blocks" ADD CONSTRAINT "discipline_blocks_year_fkey" FOREIGN KEY ("year") REFERENCES "exams"("year") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_year_fkey" FOREIGN KEY ("year") REFERENCES "exams"("year") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_files" ADD CONSTRAINT "question_files_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternatives" ADD CONSTRAINT "alternatives_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Dois NULL são distintos num UNIQUE do Postgres, então
-- questions_year_index_language_key não impede a mesma questão comum entrar
-- duas vezes. Este índice parcial fecha o buraco. O Prisma não modela índice
-- parcial, então ele vive aqui e não no schema.prisma.
CREATE UNIQUE INDEX "questions_year_index_plain"
  ON "questions" ("year", "index")
  WHERE "language" IS NULL;

-- Idem para CHECK: o Prisma não os modela, mas o banco pode garantir.
ALTER TABLE "discipline_blocks"
  ADD CONSTRAINT "discipline_blocks_check" CHECK ("end_index" > "start_index");
