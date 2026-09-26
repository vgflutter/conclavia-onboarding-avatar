# syntax=docker/dockerfile:1.4
# docker build --build-context avatar-kit=../conclavia-avatar-kit -t conclavia-onboarding .
FROM node:22-alpine AS dependencies
WORKDIR /workspace/conclavia-avatar-kit
COPY --from=avatar-kit package.json package-lock.json ./
RUN npm ci
WORKDIR /workspace/conclavia-onboarding-avatar
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace/conclavia-onboarding-avatar
COPY --from=avatar-kit src /workspace/conclavia-avatar-kit/src
COPY --from=avatar-kit assets /workspace/conclavia-avatar-kit/assets
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app/conclavia-onboarding-avatar
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3002
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /workspace/conclavia-onboarding-avatar/.next/standalone /app/
COPY --from=builder --chown=nextjs:nodejs /workspace/conclavia-onboarding-avatar/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/conclavia-onboarding-avatar/public ./public
COPY --from=builder /workspace/conclavia-onboarding-avatar/scripts/production-config.mjs /workspace/conclavia-onboarding-avatar/scripts/check-production.mjs /workspace/conclavia-onboarding-avatar/scripts/start-production.mjs ./scripts/
USER nextjs
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=12s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/api/health', {signal: AbortSignal.timeout(10000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "scripts/start-production.mjs"]
