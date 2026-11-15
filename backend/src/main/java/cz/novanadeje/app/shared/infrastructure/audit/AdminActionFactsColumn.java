package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

final class AdminActionFactsColumn {

    private static final Logger log = LoggerFactory.getLogger(AdminActionFactsColumn.class);

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SUMMARY_KEY = "summaryKey";
    private static final String VALUES = "values";

    private AdminActionFactsColumn() {
    }

    static String write(AdminActionPerformed.Facts facts) {
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        root.put(SUMMARY_KEY, facts.summaryKey());
        ObjectNode values = root.putObject(VALUES);
        new TreeMap<>(facts.values()).forEach(values::put);
        return JSON.writeValueAsString(root);
    }

    static Optional<AdminActionPerformed.Facts> read(UUID actionId, String column) {
        if (column == null) {
            return Optional.empty();
        }
        try {
            Optional<AdminActionPerformed.Facts> facts = parse(JSON.readTree(column));
            if (facts.isEmpty()) {
                log.warn("The facts of admin action {} could not be read: not an object of a summary key and text values", actionId);
            }
            return facts;
        } catch (JacksonException | IllegalArgumentException unreadable) {
            log.warn("The facts of admin action {} could not be read: {}", actionId, unreadable.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private static Optional<AdminActionPerformed.Facts> parse(JsonNode root) {
        JsonNode summaryKey = root.path(SUMMARY_KEY);
        JsonNode values = root.path(VALUES);
        if (!summaryKey.isString() || !values.isObject()) {
            return Optional.empty();
        }
        Map<String, String> read = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> value : values.properties()) {
            if (!value.getValue().isString()) {
                return Optional.empty();
            }
            read.put(value.getKey(), value.getValue().asString());
        }
        return Optional.of(AdminActionPerformed.Facts.of(summaryKey.asString(), read));
    }
}
