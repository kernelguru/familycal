# FamilyCal Server – PocketBase mit Hooks und Migrationen
# Build-Kontext ist das Repo-Root:  docker build -f server/Dockerfile .
FROM alpine:3.22

ARG PB_VERSION=0.40.6
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates tzdata unzip wget \
 && cd /tmp \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/checksums.txt" \
 && grep " pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip\$" checksums.txt | sha256sum -c - \
 && mkdir -p /pb \
 && unzip -q "pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" pocketbase -d /pb \
 && rm -f /tmp/*.zip /tmp/checksums.txt \
 && apk del unzip

COPY server/pb_migrations /pb/pb_migrations
COPY server/pb_hooks /pb/pb_hooks
COPY shared/calendar.js /pb/pb_hooks/lib/calendar.js
COPY server/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
 && adduser -D -H -u 1000 pb \
 && mkdir -p /pb/pb_data && chown pb:pb /pb/pb_data

USER pb
# Zeitzone für Wiederholungen und Texte in Benachrichtigungen
ENV TZ=Europe/Berlin
EXPOSE 8090
VOLUME /pb/pb_data
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1
ENTRYPOINT ["/entrypoint.sh"]
