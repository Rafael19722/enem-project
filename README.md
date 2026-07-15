# ENEM · Gerador de Simulados

Monte simulados do ENEM em PDF: escolha ano e disciplina, defina a quantidade e
receba um PDF com questões **sorteadas aleatoriamente**. As questões vêm da API
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

| Método | Rota                                          | Descrição                              |
| ------ | --------------------------------------------- | -------------------------------------- |
| GET    | `/exams/years`                                | Anos disponíveis (mais recente primeiro) |
| GET    | `/exams/:year/disciplines`                    | Disciplinas + idiomas do ano           |
| GET    | `/exams/:year/questions?discipline=&amount=`  | Sorteia `amount` questões da disciplina |
| POST   | `/pdf/questions`                              | Gera o PDF (body: `{ questions: [...] }`) |

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
