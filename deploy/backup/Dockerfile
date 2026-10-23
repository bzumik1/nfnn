FROM postgres:17-alpine

COPY backup.sh /usr/local/bin/nfnn-backup
RUN chmod 0755 /usr/local/bin/nfnn-backup

ENTRYPOINT ["/usr/local/bin/nfnn-backup"]
