# Local development API (on AWS the same code runs on Lambda; see template.yaml).
FROM node:22-alpine
WORKDIR /app

# Prisma's migration engine needs OpenSSL on Alpine.
RUN apk add --no-cache openssl

# Install dependencies. postinstall runs `prisma generate`, so the schema goes in first.
COPY package*.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
RUN npm ci

COPY src ./src

ENV PORT=8000
EXPOSE 8000

# Apply any pending migrations, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/local.ts"]
