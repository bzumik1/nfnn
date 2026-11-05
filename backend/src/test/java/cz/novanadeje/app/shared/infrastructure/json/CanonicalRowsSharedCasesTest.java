package cz.novanadeje.app.shared.infrastructure.json;

import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

class CanonicalRowsSharedCasesTest extends SharedCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    @Override
    protected String caseFile() {
        return "sync/canonical.json";
    }

    @Override
    protected String when() {
        return "when the backend writes the rows canonically and hashes them";
    }

    @Override
    protected String then() {
        return "then it gives the case's canonical JSON and rowsSha256, or refuses the rows";
    }

    @Override
    protected void run(SharedCase sharedCase) {
        JsonNode rows = sharedCase.input().get("rows");
        ObjectNode written = NODES.objectNode();
        try {
            written.put("canonical", CanonicalRows.canonical(rows));
            written.put("rowsSha256", CanonicalRows.sha256(rows));
        } catch (IllegalStateException refused) {
            written.removeAll();
            written.put("refusal", "not-a-safe-integer");
        }
        assertGives(written, sharedCase.expected());
    }
}
