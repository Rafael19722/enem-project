# ENEM · Gerador de Simulados

Monte simulados do ENEM combinando quantas matérias e anos quiser: **responda
online** (modo treino, com correção na hora, ou modo prova, corrigindo no fim)
ou **baixe em PDF** de duas colunas com gabarito. Questões sorteadas
aleatoriamente, sem cadastro. As questões vêm da API pública
[api.enem.dev](https://api.enem.dev).

Reescrita modernizada de um projeto legado (`enem_consume`).

## Stack

| Camada   | Tecnologia                                                        |
| -------- | ----------------------------------------------------------------- |
| Frontend | Vite + React + TypeScript, TanStack Query/Router, shadcn/ui (Base UI) + Tailwind v4 |
| Backend  | NestJS 11 + Prisma 6 (lê do Postgres, gera PDF com pdfkit)         |
| Banco    | PostgreSQL 16 (espelho da api.enem.dev)                            |
| Deploy   | Frontend → Vercel · Backend + banco → VPS Ubuntu (Docker + Caddy) |
| Gerenciador | pnpm                                                           |

## Estrutura

```
enem-project/
├── backend/            # NestJS  (Dockerfile do deploy junto)
│   ├── prisma/         # schema e migrações do banco
│   └── src/database/   # coleta da api.enem.dev que popula o banco
├── frontend/           # Vite SPA (deploy: Vercel)
├── docker-compose.yml  # Postgres do espelho, para desenvolver local
└── deploy/             # stack da VPS: backend + banco, e o Caddy compartilhado
```

## Rodando localmente

Pré-requisitos: Node 20+ e pnpm.

```bash
# banco  →  localhost:5433
docker compose up -d

# backend  →  http://localhost:5000
cd backend
cp .env.example .env
pnpm install
pnpm run db:ingest      # popula o banco (ver "Banco de dados")
pnpm run start:dev

# frontend →  http://localhost:5173
cd ../frontend
cp .env.example .env
pnpm install
pnpm run dev
```

## Variáveis de ambiente

**backend/.env**

| Variável       | Descrição                                             |
| -------------- | ----------------------------------------------------- |
| `PORT`         | Porta do servidor (5000 no container)                  |
| `CORS_ORIGIN`  | Origens permitidas, separadas por vírgula             |
| `ENEM_API_URL` | Base da API do ENEM, usada só pelo `db:ingest`         |
| `DATABASE_URL` | Postgres de onde o backend lê (`postgresql://enem:enem@localhost:5433/enem`) |

**frontend/.env**

| Variável       | Descrição                    |
| -------------- | ---------------------------- |
| `VITE_API_URL` | URL base do backend NestJS   |

## Banco de dados

**O backend lê as provas daqui, não da `api.enem.dev`.** Não há fallback: se o
Postgres não responde, o endpoint falha. A API de origem aceita **10 requisições
a cada 10 segundos** e um simulado de várias matérias e vários anos estoura isso
sozinho — cair de volta nela transformaria uma queda clara numa queda lenta e
intermitente.

```bash
# sobe o Postgres (porta 5433, pra não brigar com um Postgres local em 5432)
docker compose up -d

# aplica as migrações e popula: coleta a API e grava os 15 anos
cd backend
pnpm run db:ingest
```

A coleta anda a ~1 requisição por segundo de propósito e leva alguns minutos.
O que vem da API é guardado cru em `backend/data/enem/<ano>.json` **antes** de
virar linha: mexer no schema e recarregar não custa requisição nenhuma, e uma
coleta interrompida retoma de onde parou.

```bash
pnpm run db:ingest -- 2023 2022   # só esses anos
pnpm run db:ingest -- --refetch   # ignora o cache e busca de novo
```

### Tabelas

O schema comentado está em `backend/prisma/schema.prisma`, e as migrações em
`backend/prisma/migrations/`. `pnpm run db:migrate` aplica as migrações sem
popular nada.

| Modelo | Tabela | O que guarda |
| --- | --- | --- |
| `Exam` | `exams` | Um ano, com as listas de disciplinas e idiomas como a API entrega |
| `DisciplineBlock` | `discipline_blocks` | Onde cada matéria começa e termina no caderno daquele ano |
| `Question` | `questions` | A questão crua: enunciado em markdown, gabarito, disciplina |
| `Alternative` | `alternatives` | As alternativas, uma linha por letra |
| `QuestionFile` | `question_files` | As figuras do enunciado, na ordem em que a API as lista |

Duas coisas que o Prisma não modela vivem escritas à mão na migração inicial: o
índice único **parcial** em `(year, index) WHERE language IS NULL` e o `CHECK`
de `discipline_blocks`. Um `prisma migrate dev` futuro vai querer removê-los —
recuse, ou reescreva a migração gerada.

**A chave de uma questão é `(year, index, language)`, não `(year, index)`.** As
cinco vagas de língua estrangeira existem uma vez por idioma — o ENEM 2023 tem
duas "Questão 1", uma de espanhol e outra de inglês. E `index` tem furos:
questão anulada some (2023 não tem 34 nem 174).

**Os tipos do runtime vêm do Prisma.** `backend/src/common/question.ts` deriva
`Question` de `Prisma.QuestionGetPayload`, então não há interface escrita à mão
espelhando as colunas nem mapeamento de linha pra objeto. A forma que a
`api.enem.dev` devolve é outra coisa e vive só na ingestão, como `ApiQuestion`
em `backend/src/database/enem-source.ts`.

**O enunciado é guardado como veio, em markdown.** A limpeza continua em
`backend/src/common/question-content.ts`, rodando na leitura. Guardar o texto já
parseado congelaria no banco os bugs do parser do dia da ingestão — e cada
correção dele exigiria repopular tudo.

**`discipline_blocks` existe porque `questions.discipline` não é confiável.** O
rótulo por questão da API tem erro; o bloco é deduzido por maioria a partir da
posição no caderno. O sorteio filtra por `block_discipline`, nunca por
`discipline`. A dedução vive em `backend/src/database/discipline-blocks.ts`,
rodando só na ingestão.

## Endpoints do backend

| Método | Rota                       | Descrição                                       | Limite   |
| ------ | -------------------------- | ----------------------------------------------- | -------- |
| GET    | `/exams/years`             | Anos disponíveis (mais recente primeiro)        | 60/min   |
| GET    | `/exams/:year/disciplines` | Disciplinas + idiomas do ano                    | 60/min   |
| POST   | `/exams/draw`              | Sorteia as questões de uma ou mais seleções     | 20/min   |
| POST   | `/exams/check`             | Corrige respostas (o gabarito fica no servidor) | 150/min  |
| POST   | `/pdf/questions`           | Gera o PDF das questões sorteadas               | 5/min    |

O limite é por IP e por rota, contado numa janela deslizante de um minuto
(`@nestjs/throttler`). Estourar devolve `429` com um header `Retry-After`. Em
produção quem fala com o backend é o Caddy, então o app roda com `trust proxy`
pra contar o IP real que ele encaminha — sem isso todo mundo dividiria a mesma
cota. O `/pdf/questions` é o mais apertado porque cada PDF baixa as imagens de
todas as questões e monta o documento inteiro. Já o `/exams/check` é folgado de
propósito: no modo treino o front corrige uma questão por vez, então um simulado
de 45 questões são 45 chamadas — mais ainda se o aluno trocar de resposta.

```jsonc
// POST /exams/draw  →  ExamQuestion[]  (sem as respostas)
{
  "selections": [
    { "year": 2023, "discipline": "matematica", "amount": 5 },
    { "year": 2016, "discipline": "linguagens", "amount": 5 }
  ]
}

// POST /exams/check  →  [{ year, index, correct, correctAlternative }]
// `letter: null` = em branco, conta como erro.
{ "answers": [{ "year": 2023, "index": 147, "letter": "B" }] }

// POST /pdf/questions  →  application/pdf
// As questões vão por referência: o servidor as relê do próprio cache, então o
// gabarito nunca precisa passar pelo navegador.
{
  "refs": [
    { "year": 2023, "index": 147 },
    { "year": 2016, "index": 100 }
  ]
}
```

## Detalhes que valem saber

**O layout do ENEM muda conforme o ano.** A prova sempre tem quatro blocos de 45
questões, mas a ordem das matérias não é fixa: 2017 trocou Linguagens e Ciências
Humanas de lugar, e 2009 ordena as ciências de outro jeito. Por isso o bloco de
cada disciplina é deduzido do manifesto que a própria API devolve em
`/exams/{year}`, e por maioria — os rótulos de disciplina que ela dá questão a
questão contêm erros — divergem do bloco em 149 das 2.749 questões. A dedução
está em `backend/src/database/discipline-blocks.ts` e roda uma vez, na ingestão:
o runtime só lê a coluna `block_discipline`.

**As fontes são versionadas junto** (`backend/src/pdf/fonts/`). O Helvetica
embutido no pdfkit só cobre Latin-1 e corrompe `π`, `−`, `≠`, `∈` e `µ`, que
aparecem nas provas. O `nest-cli.json` copia os `.ttf` para o `dist` no build.

**As imagens da API não têm escala padronizada** (variam de 35px a 1248px de
largura). Figuras e fórmulas de alternativa são normalizadas por regras
diferentes: figura de enunciado cabe na largura da coluna, fórmula de
alternativa é escalada pela altura da linha de texto. E a maioria é PNG com
transparência e traço escuro: na web elas vão sobre uma placa branca, senão
somem no modo noturno.

**O conteúdo é parseado uma vez só, no servidor**
(`backend/src/common/question-content.ts`). O PDF e a web consomem os mesmos
segmentos de texto e figura, então as peculiaridades da API são tratadas num
lugar só:

- figura embutida no meio da frase, que precisa sair em ordem de leitura e não
  empilhada no fim (2023 q152 vira "Considere 0,3 como aproximação para ." sem
  isso), com a pontuação órfã colada de volta na frase anterior;
- `_N_` e `_I_`, que a API emite como itálico de markdown e sem tratamento são
  lidos literalmente;
- headers "TEXTO" que o OCR escreve com homóglifos cirílicos;
- quebras de parágrafo, que são conteúdo: enunciado, citação da fonte e pergunta
  viram um bloco ilegível se todo espaço em branco for colapsado. Espaço
  horizontal colapsa, sequência de `\n` vira uma quebra só.

**O código do backend não tem comentários.** O que era comentário virou esta
seção — se for mexer em parsing, layout de PDF ou dedução de bloco, leia daqui
antes.

**O design do simulado online** está em `specs/simulado-online.md`, incluindo o
que ele deliberadamente não promete (nota TRI, proteção contra trapaça).

**A paginação da API não é a que se espera.** Em `/exams/{year}/questions`,
`offset` é o *número da questão* (1-based), não um cursor de registros, e
`limit` conta registros devolvidos — então uma página pode terminar além de
`offset + limit` e às vezes devolve um registro a mais que o pedido. A coleta
por isso continua a partir do maior índice que realmente viu, em vez de somar
`limit` ao offset.

**Sem `?language=`, a API escolhe espanhol** para as cinco vagas de língua
estrangeira, em vez de devolver os dois idiomas. Cada idioma listado no ano
precisa de uma passada própria — 2009 não lista nenhum e 2011 só espanhol.

**2011 não tem pool de idioma.** A API lista espanhol para o ano, mas devolve as
cinco vagas de língua estrangeira como registros duplicados e sem `language` —
duas cópias idênticas da mesma questão em inglês. Não há o que sortear em
`ingles` ou `espanhol` nesse ano, e as cinco caem dentro de `linguagens`.

**Sete questões vêm com quatro alternativas**, sem a letra E (2011 q180, 2013
q64, 2016 q47, 2021 q105 e q175, 2022 q144 e q166). É falha do dado de origem,
não da coleta: quem renderiza não pode assumir cinco.

**Uma referência `(year, index)` é ambígua nas questões de idioma.** As cinco
vagas de língua estrangeira compartilham o índice, e `POST /exams/check` e
`POST /pdf/questions` mandam só ano e número — então uma questão de inglês é
resolvida pela de espanhol de mesmo número, e corrigida contra o gabarito
errado. É comportamento antigo, mantido na troca pro banco para não mexer no
contrato do cliente sem querer. Consertar é pôr `language` na referência, o que
mexe no frontend, na sessão do `localStorage` e nos dois DTOs.

## Deploy

Frontend na Vercel, backend e banco numa VPS Ubuntu com Docker. O `deploy/`
guarda a stack de produção — o `docker-compose.yml` da raiz continua sendo só o
Postgres de desenvolvimento.

### VPS — uma vez só

O Caddy fica numa rede Docker externa, compartilhado: é o único container com
porta no host, e outros projetos entram na mesma VPS sem brigar por 80/443.

```bash
docker network create edge
scp -r deploy/edge vps:/opt/edge
ssh vps 'docker compose -f /opt/edge/docker-compose.yml up -d'
```

Cada projeto novo ganha um bloco no `/opt/edge/Caddyfile` apontando pro
`container_name` dele. O certificado o Caddy tira sozinho, desde que o DNS do
domínio já aponte pra VPS antes de subir.

### Backend + banco

```bash
# na VPS, dentro do repo
cp deploy/.env.example deploy/.env      # POSTGRES_PASSWORD e CORS_ORIGIN
docker compose -f deploy/docker-compose.yml up -d --build
```

Nenhum dos dois publica porta no host: o Postgres só existe na rede do projeto
e o backend só é alcançável pelo Caddy, pela rede `edge`. O container roda
`prisma migrate deploy` no boot, então o banco sobe migrado — e vazio.

Para popular sem passar de novo pelo rate limit da API, leve o cache cru junto
em vez de coletar tudo outra vez:

```bash
rsync -a backend/data/enem/ vps:~/enem-project/backend/data/enem/
ssh vps 'cd enem-project/backend && pnpm install && pnpm run db:ingest'
```

Ou copie o banco local já pronto, que tem ~12 MB:

```bash
docker exec enem-postgres pg_dump -U enem -d enem --no-owner --no-privileges \
  | ssh vps 'docker exec -i enem-postgres psql -U enem -d enem'
```

Depois de um push, atualizar é `git pull && docker compose -f
deploy/docker-compose.yml up -d --build`.

### Frontend — Vercel

1. Import do repo com **Root Directory** = `frontend`.
2. Framework: Vite (detectado). O `vercel.json` já faz o fallback SPA.
3. Env var `VITE_API_URL` = domínio do backend na VPS (ex.:
   `https://api.seudominio.com.br`).
