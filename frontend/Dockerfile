# ----------------------------- #
# 1️⃣ Build Stage
# ----------------------------- #
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and lockfile
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy app source
COPY . .

# Build Next.js app
RUN npm run build

# ----------------------------- #
# 2️⃣ Production Image
# ----------------------------- #
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy only necessary files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next .next
COPY --from=builder /app/public ./public

# Install only production dependencies
RUN npm install --production --legacy-peer-deps

EXPOSE 3000

CMD ["npm", "start"]
