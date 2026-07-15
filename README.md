# ENEM · Gerador de Simulados

Monte simulados do ENEM em PDF: combine quantas matérias e anos quiser, defina
quantas questões quer de cada um e receba um PDF de duas colunas com questões
**sorteadas aleatoriamente** e **gabarito** no final. As questões vêm da API
pública [api.enem.dev](https://api.enem.dev).

Reescrita modernizada de um projeto legado (`enem_consume`).

## Stack

| Camada   | Tecnologia                                                        |
| -------- | ----------------------------------------------------------------- |
| Frontend | Vite + React + TypeScript, TanStack Query/Router, shadcn/ui (Base UI) + Tailwind v4 |
| Backend  | NestJS 11 (proxy da api.enem.dev + geração de PDF com pdfkit)      |
| Deploy   | Frontend → Vercel · Backend → Render                              |
| Gerenciador | pnpm                                                           |

## Estrutura

```
enem-project/
├── backend/     # NestJS  (deploy: Render)
├── frontend/    # Vite SPA (deploy: Vercel)
└── render.yaml  # blueprint do backend no Render
```

## Rodando localmente

Pré-requisitos: Node 20+ e pnpm.

```bash
# backend  →  http://localhost:5000
cd backend
cp .env.example .env
pnpm install
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
| `PORT`         | Porta do servidor (Render injeta a sua)               |
| `CORS_ORIGIN`  | Origens permitidas, separadas por vírgula             |
| `ENEM_API_URL` | Base da API do ENEM (`https://api.enem.dev/v1`)       |

**frontend/.env**

| Variável       | Descrição                    |
| -------------- | ---------------------------- |
| `VITE_API_URL` | URL base do backend NestJS   |

## Endpoints do backend

| Método | Rota                       | Descrição                                  |
| ------ | -------------------------- | ------------------------------------------ |
| GET    | `/exams/years`             | Anos disponíveis (mais recente primeiro)   |
| GET    | `/exams/:year/disciplines` | Disciplinas + idiomas do ano               |
| POST   | `/exams/draw`              | Sorteia as questões de uma ou mais seleções |
| POST   | `/pdf/questions`           | Gera o PDF das questões sorteadas          |

```jsonc
// POST /exams/draw  →  Question[]  (sem as respostas)
{
  "selections": [
    { "year": 2023, "discipline": "matematica", "amount": 5 },
    { "year": 2016, "discipline": "linguagens", "amount": 5 }
  ]
}

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
questão contêm erros. Detalhes em `backend/src/exams/discipline-blocks.ts`.

**As fontes são versionadas junto** (`backend/src/pdf/fonts/`). O Helvetica
embutido no pdfkit só cobre Latin-1 e corrompe `π`, `−`, `≠`, `∈` e `µ`, que
aparecem nas provas. O `nest-cli.json` copia os `.ttf` para o `dist` no build.

**As imagens da API não têm escala padronizada** (variam de 35px a 1248px de
largura). Figuras e fórmulas de alternativa são normalizadas por regras
diferentes — o porquê está comentado em `backend/src/pdf/pdf.service.ts`.

## Deploy

### Backend — Render

1. Novo **Blueprint** apontando para este repo (usa o `render.yaml`), ou um
   **Web Service** manual com root `backend/`.
2. Build: `pnpm install && pnpm run build` · Start: `node dist/main.js`
3. Env var `CORS_ORIGIN` = domínio da Vercel (ex.: `https://enem.vercel.app`).

> Plano free dorme após ~15min de inatividade; o primeiro request depois disso
> leva ~30s pra acordar (o front trata isso com um aviso de loading).

### Frontend — Vercel

1. Import do repo com **Root Directory** = `frontend`.
2. Framework: Vite (detectado). O `vercel.json` já faz o fallback SPA.
3. Env var `VITE_API_URL` = URL pública do backend no Render.
