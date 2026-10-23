FROM postgres:17-alpine

COPY nfnn-postgres.sh /usr/local/bin/nfnn-postgres
RUN chmod 0755 /usr/local/bin/nfnn-postgres

ENTRYPOINT ["/usr/local/bin/nfnn-postgres"]
CMD ["postgres"]
