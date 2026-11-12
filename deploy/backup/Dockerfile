FROM postgres:17-alpine

COPY backup.sh /usr/local/bin/nfnn-backup
COPY revoke-restored-credentials.sql /usr/local/share/nfnn/revoke-restored-credentials.sql
COPY carry-forward.sql /usr/local/share/nfnn/carry-forward.sql
RUN apk add --no-cache age && chmod 0755 /usr/local/bin/nfnn-backup \
    && chmod 0644 /usr/local/share/nfnn/revoke-restored-credentials.sql /usr/local/share/nfnn/carry-forward.sql

ENTRYPOINT ["/usr/local/bin/nfnn-backup"]
