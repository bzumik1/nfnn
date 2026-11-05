package cz.novanadeje.app.shared.infrastructure.json;

import cz.novanadeje.app.shared.application.version.RowVersions;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
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
        JsonNode tree = json.valueToTree(rows);
        tree.values().forEach(CanonicalRowVersions::removeVersion);
        return CanonicalRows.sha256(tree).substring(0, VERSION_HEX_LENGTH);
    }

    private static void removeVersion(JsonNode row) {
        if (row instanceof ObjectNode object) {
            object.remove(VERSION_FIELD);
        }
    }
}
