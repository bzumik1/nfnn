package cz.novanadeje.app.shared.infrastructure.json;

import cz.novanadeje.app.shared.application.version.RowVersions;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

@Component
class CanonicalRowVersions implements RowVersions {

    static final int VERSION_HEX_LENGTH = 16;

    private final JsonMapper json;

    CanonicalRowVersions(JsonMapper json) {
        this.json = json;
    }

    @Override
    public String versionOf(List<?> rows) {
        return versionOfTree(json.valueToTree(rows));
    }

    static String versionOfTree(JsonNode rows) {
        ArrayNode withoutVersions = JsonNodeFactory.instance.arrayNode();
        rows.values().forEach(row -> withoutVersions.add(withoutVersion(row)));
        return CanonicalRows.sha256(withoutVersions).substring(0, VERSION_HEX_LENGTH);
    }

    private static JsonNode withoutVersion(JsonNode row) {
        if (!row.isObject()) {
            return row;
        }
        ObjectNode copy = ((ObjectNode) row).deepCopy();
        copy.remove(VERSION_FIELD);
        return copy;
    }
}
