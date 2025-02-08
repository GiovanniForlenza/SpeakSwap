FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive
# Aggiungi questa riga per Node.js
ENV NODE_VERSION=20.x

RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    python3 \
    python3-pip \
    pkg-config \
    portaudio19-dev \
    python3-dev \
    libcairo2-dev \
    ffmpeg \
    libopus0 \
    libopusfile0 \
    && rm -rf /var/lib/apt/lists/*

# Aggiungi questo blocco dopo le altre installazioni
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION} | bash - \
    && apt-get update \
    && apt-get install -y nodejs \
    && npm install -g npm@latest \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip3 install -r requirements.txt

# Aggiungi queste righe per Node.js/React
COPY package*.json ./
RUN if [ -f package.json ]; then npm install; fi

COPY . .

# Modifica questa riga per esporre entrambe le porte
EXPOSE 3000 8000

CMD ["python3", "main.py"]