FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# Litestream for continuous SQLite replication (no-op unless configured).
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin && rm /tmp/litestream.tar.gz

COPY package.json package-lock.json ./
RUN npm ci
COPY . .

EXPOSE 8080
ENTRYPOINT ["./docker-entrypoint.sh"]
