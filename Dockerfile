# Stage 1: Build the React frontend
FROM node:24-bookworm AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# Stage 2: Run the backend and serve the frontend
FROM node:24-bookworm

WORKDIR /app/backend

# better-sqlite3 is a native Node module,
# so install the tools required to build it.
RUN apt-get update \
    && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./

# Copy the built React application
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

ENV PORT=3000
ENV STOCKMATE_DB_PATH=/app/backend/data/stockmate.db
ENV STOCKMATE_LOG_PATH=/app/backend/logs/app.log

EXPOSE 3000

CMD ["node", "index.js"]
