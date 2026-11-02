FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NITRO_PRESET=node-server
ENV VITE_DEMO_MODE=false
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
ENV HOST=0.0.0.0
ENV PORT=3000
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
