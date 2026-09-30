# X5 Commander: the built game and the scoreboard API on one port. The server needs no packages at run time.
#   docker build -t x5-commander .
#   docker run -p 8080:8080 -v x5-data:/data x5-commander
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build

FROM node:24-slim
ENV NODE_ENV=production PORT=8080 X5_SCORES_DB=/data/scores.db X5_DIST=/app/dist
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/ ./server/
RUN rm -f server/*.check.ts
COPY package.json ./
RUN mkdir -p /data && chown node:node /data && chmod 700 /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
