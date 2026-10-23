FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npx tsx src/scripts/setup-ocr.ts
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
