FROM postgres:17.12-alpine@sha256:34261f594522cf41dfcb76aefd42b9d201098b0e6b23c9c68733f169e4218b6f

COPY backup.sh /usr/local/bin/nfnn-backup
COPY revoke-restored-credentials.sql /usr/local/share/nfnn/revoke-restored-credentials.sql
COPY carry-forward.sql /usr/local/share/nfnn/carry-forward.sql
RUN apk add --no-cache age && chmod 0755 /usr/local/bin/nfnn-backup \
    && chmod 0644 /usr/local/share/nfnn/revoke-restored-credentials.sql /usr/local/share/nfnn/carry-forward.sql

ENTRYPOINT ["/usr/local/bin/nfnn-backup"]
