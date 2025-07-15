#############################
# 1️⃣ Build Stage
#############################
FROM node:20-alpine AS builder
WORKDIR /app

# ── Copy manifest files first to leverage Docker cache
COPY package*.json ./

# ── Install all dependencies (prod + dev) deterministically
RUN npm ci --legacy-peer-deps

# ── Bring in environment variables used during the build
COPY .env .env

# ── Copy the full application source
COPY . .

# ── Compile / bundle the Next.js app (env vars are “baked in” here)
RUN npm run build


#############################
# 2️⃣ Runtime Stage
#############################
FROM node:20-alpine
WORKDIR /app

# ── Copy only the artifacts needed to run the app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next .next
COPY --from=builder /app/public ./public

# ── Copy the same .env so `next start` can read server-side vars
COPY --from=builder /app/.env .env

# ── Install *production-only* dependencies
RUN npm ci --production --legacy-peer-deps

# ── Expose the Next.js default port
EXPOSE 3000

# ── Start the production server
CMD ["npm", "start"]
