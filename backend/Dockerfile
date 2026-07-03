FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat openssl
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache vips-dev openssl
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
