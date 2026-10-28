FROM postgres:17-alpine

COPY backup.sh /usr/local/bin/nfnn-backup
COPY own-by-app-role.sql /usr/local/share/nfnn/own-by-app-role.sql
RUN apk add --no-cache age && chmod 0755 /usr/local/bin/nfnn-backup && chmod 0644 /usr/local/share/nfnn/own-by-app-role.sql

ENTRYPOINT ["/usr/local/bin/nfnn-backup"]
