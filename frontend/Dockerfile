#############################
# 1️⃣ Build Stage
#############################
FROM node:20-alpine AS builder
WORKDIR /app

# ── Copy manifest files first to leverage Docker cache
COPY ./package*.json ./

# ── Install all dependencies (prod + dev) deterministically
RUN npm ci --legacy-peer-deps

# ── Copy the full application source
COPY ./ ./

# ── Compile / bundle the Next.js app (env vars are "baked in" here)
RUN npm run build

# ── Set port for Kanopy (8080 standard)
ENV PORT=8080

# ── Expose the port
EXPOSE 8080

# ── Start the production server
CMD ["npm", "start"]
