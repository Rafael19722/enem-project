# Imagem do backend NestJS.
#
# Debian slim em vez de Alpine: os engines do Prisma são compilados contra
# glibc/OpenSSL, e o musl do Alpine exige um binaryTarget à parte.

FROM node:24-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# O schema entra antes do install: o postinstall do Prisma só gera o client
# se encontrar prisma/schema.prisma.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN pnpm exec prisma generate && pnpm run build


FROM node:24-slim AS runner

# ca-certificates: o gerador de PDF baixa as figuras da api.enem.dev por HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# node_modules vem inteiro do builder porque o start roda `prisma migrate
# deploy`, e o CLI do Prisma é devDependency.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

USER node
EXPOSE 5000

# As migrações rodam a cada boot: são idempotentes e deixam um banco vazio
# pronto pro ingest. Popular as questões continua sendo passo manual.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
