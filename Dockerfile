FROM --platform=linux/amd64 ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=20.x

# Installa dipendenze di base
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    ffmpeg \
    libopus0 \
    libopusfile0 \
    && rm -rf /var/lib/apt/lists/*

# Installa Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION} | bash - \
    && apt-get update \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Installa .NET 6
RUN wget https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y apt-transport-https \
    && apt-get update \
    && apt-get install -y dotnet-sdk-6.0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia e installa le dipendenze del frontend React
COPY chat-room-app/package*.json ./chat-room-app/
RUN cd chat-room-app && npm install

# Copia tutto il contenuto del progetto
COPY . .

# Costruisci l'app React
RUN cd chat-room-app && npm run build

# Pubblica l'app ASP.NET
RUN cd AudioServer && dotnet publish -c Release -o /app/AudioServer/publish

# Esponi le porte per React e ASP.NET
EXPOSE 8081 3000

# Script di avvio per eseguire entrambi i servizi
RUN echo '#!/bin/bash\n\
    # Avvia il server React in background\n\
    cd /app/chat-room-app && npx serve -s build -l 3000 &\n\
    # Avvia il server ASP.NET in foreground (mantiene il container in esecuzione)\n\
    dotnet /app/AudioServer/publish/AudioServer.dll --urls="http://0.0.0.0:8081"\n\
    ' > /app/start.sh

RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]