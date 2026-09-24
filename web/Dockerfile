# CostPilot console (Next.js standalone). Rewrites to the gateway are compiled in at build
# time, so GATEWAY_URL is a build arg: the address the web container uses to reach the
# gateway. NEXT_PUBLIC_GATEWAY_URL is what the quickstart shows developers.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ARG GATEWAY_URL=http://gateway:8080
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:8080
ENV GATEWAY_URL=$GATEWAY_URL \
    NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
