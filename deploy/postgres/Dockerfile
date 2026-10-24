FROM postgres:17-alpine

COPY nfnn-postgres.sh /usr/local/bin/nfnn-postgres
COPY app-role.sql own-by-app-role.sql /usr/local/share/nfnn/
COPY nfnn-app-role.sh /docker-entrypoint-initdb.d/nfnn-app-role.sh
RUN chmod 0755 /usr/local/bin/nfnn-postgres /docker-entrypoint-initdb.d/nfnn-app-role.sh \
    && chmod 0644 /usr/local/share/nfnn/app-role.sql /usr/local/share/nfnn/own-by-app-role.sql

ENTRYPOINT ["/usr/local/bin/nfnn-postgres"]
CMD ["postgres"]
