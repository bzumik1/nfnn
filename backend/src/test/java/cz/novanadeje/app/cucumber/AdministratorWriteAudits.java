package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.cucumber.transcript.AuditedExchange;

import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

final class AdministratorWriteAudits {

    private static final String ADMINISTRATION = "/api/admin/";
    private static final Set<String> READS = Set.of("GET", "HEAD", "OPTIONS");
    private static final Pattern UUID_SEGMENT = Pattern.compile("/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=/|$)");
    private static final Pattern DIGEST_SEGMENT = Pattern.compile("/[0-9a-f]{64}(?=/|$)");
    private static final Pattern KEY_ID_SEGMENT = Pattern.compile("/(?=[0-9]*[a-f])[0-9a-f]{8}(?=/|$)");
    private static final Pattern NUMBER_SEGMENT = Pattern.compile("/[0-9]+(?=/|$)");

    private AdministratorWriteAudits() {
    }

    record StateProbe(String reason, List<String> tables) {

        String stateIn(JdbcClient jdbc) {
            return tables.stream()
                    .map(table -> table + "=" + jdbc.sql("select md5(coalesce((select string_agg(row_digest, ',' order by row_digest) from (select md5(t::text) as row_digest from "
                            + table + " t) stored), ''))").query(String.class).single())
                    .collect(Collectors.joining(";"));
        }
    }

    static Optional<StateProbe> stateProbeOf(String method, String path, Map<String, StateProbe> probes) {
        return Optional.ofNullable(probes.get(templateOf(method, path)));
    }

    static List<String> unaudited(List<AuditedExchange> exchanges, Map<String, String> allowed) {
        Map<Integer, List<AuditedExchange>> windows = exchanges.stream()
                .collect(Collectors.groupingBy(AuditedExchange::window, LinkedHashMap::new, Collectors.toList()));
        return windows.values().stream().flatMap(window -> {
            List<AuditedExchange> writes = window.stream()
                    .filter(exchange -> isAdministratorWrite(exchange) && !exchange.stateUnchanged() && !allowed.containsKey(templateOf(exchange)))
                    .toList();
            long before = window.stream().mapToLong(AuditedExchange::auditRowsBefore).min().orElse(0);
            long after = window.stream().mapToLong(AuditedExchange::auditRowsAfter).max().orElse(0);
            return after - before >= writes.size() ? Stream.<String>empty()
                    : writes.stream().map(exchange -> templateOf(exchange) + " answered " + exchange.status());
        }).toList();
    }

    static String templateOf(AuditedExchange exchange) {
        return templateOf(exchange.method(), exchange.path());
    }

    static String templateOf(String method, String target) {
        String path = target.split("\\?", 2)[0];
        path = UUID_SEGMENT.matcher(path).replaceAll("/{id}");
        path = DIGEST_SEGMENT.matcher(path).replaceAll("/{sha256}");
        path = KEY_ID_SEGMENT.matcher(path).replaceAll("/{keyId}");
        path = NUMBER_SEGMENT.matcher(path).replaceAll("/{n}");
        return method + " " + path;
    }

    private static boolean isAdministratorWrite(AuditedExchange exchange) {
        return !READS.contains(exchange.method()) && exchange.path().startsWith(ADMINISTRATION) && exchange.status() >= 200 && exchange.status() < 300;
    }
}
