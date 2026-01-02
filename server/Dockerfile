FROM node:20-alpine AS builder
WORKDIR /app

# install all deps (including dev for build)
COPY package*.json ./
RUN npm ci

# copy prisma schema and source for build and prisma generate
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# copy compiled output and prisma client runtime files
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

EXPOSE 3001
CMD ["node", "dist/index.js"]
