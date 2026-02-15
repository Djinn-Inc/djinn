FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY . .

# Build the Next.js app
RUN pnpm build

RUN adduser -D -h /app appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

CMD ["pnpm", "start"]
