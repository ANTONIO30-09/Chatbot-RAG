FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/piper && /opt/piper/bin/pip install --no-cache-dir piper-tts==1.8.0

WORKDIR /app
RUN mkdir voices && /opt/piper/bin/python -m piper.download_voices es_ES-davefx-medium --data-dir /app/voices

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production
ENV PIPER_PYTHON=/opt/piper/bin/python
ENV PIPER_MODEL=/app/voices/es_ES-davefx-medium.onnx
USER node
CMD ["node", "server.js"]
