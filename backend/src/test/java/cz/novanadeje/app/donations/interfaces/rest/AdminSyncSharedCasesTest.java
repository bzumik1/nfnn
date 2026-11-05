package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.DonationRowsSharedCaseRunner;
import cz.novanadeje.app.shared.infrastructure.json.CanonicalRows;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCase;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class AdminSyncSharedCasesTest extends DonationRowsSharedCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final List<String> CASE_ROW_CHUNKS = List.of("payments:", "donations:", "donor-records:");

    @Override
    protected String caseFile() {
        return "sync/admin-manifest.json";
    }

    @Override
    protected String when() {
        return "when the backend reads every row with the real queries and answers an administrator the manifest and every chunk it lists";
    }

    @Override
    protected String then() {
        return "then the administrator gets the expected chunks of payments, donations and donor records with their rows";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        CaseRows rows = writeRows(sharedCase.input());
        rows.writeAdministrator(jdbc());
        UUID administrator = CaseRows.administratorId();

        JsonNode manifest = answerAs(administrator, "ROLE_ADMIN", get("/api/admin/donations/sync"));
        List<String> ids = manifest.get("chunks").valueStream().map(chunk -> chunk.get("id").asString())
                .filter(id -> CASE_ROW_CHUNKS.stream().anyMatch(id::startsWith)).toList();
        ArrayNode chunks = NODES.arrayNode();
        if (!ids.isEmpty()) {
            JsonNode bodies = answerAs(administrator, "ROLE_ADMIN", get("/api/admin/donations/sync/chunks").param("ids", String.join(",", ids)));
            assertThat(bodies.get("subject")).isEqualTo(manifest.get("subject"));
            assertThat(bodies.get("summary")).as("the summary of the chunks and of their manifest").isEqualTo(manifest.get("summary"));
            assertThat(bodies.get("missing").isEmpty()).as("chunks the manifest listed went missing: %s", bodies.get("missing")).isTrue();
            assertThat(bodies.get("chunks").size()).isEqualTo(ids.size());
            for (int index = 0; index < ids.size(); index++) {
                String id = ids.get(index);
                JsonNode listed = manifest.get("chunks").valueStream().filter(chunk -> chunk.get("id").asString().equals(id)).findFirst().orElseThrow();
                JsonNode body = bodies.get("chunks").get(index);
                assertThat(body.get("id").asString()).isEqualTo(id);
                assertThat(body.get("rowsSha256")).as("the body of %s and its manifest entry", listed.get("id")).isEqualTo(listed.get("rowsSha256"));
                assertThat(body.get("count")).isEqualTo(listed.get("count"));
                assertThat(CanonicalRows.sha256(body.get("rows"))).as("the SHA-256 of the canonical rows of %s as answered", listed.get("id"))
                        .isEqualTo(body.get("rowsSha256").asString());
                chunks.add(body);
            }
        }
        ObjectNode joined = NODES.objectNode();
        joined.set("subject", manifest.get("subject"));
        joined.set("administrator", manifest.get("administrator"));
        joined.set("chunks", chunks);

        assertGives(withCaseDigests(rows.aliased(joined)), sharedCase.expected());
    }

    private static JsonNode withCaseDigests(JsonNode aliased) {
        aliased.get("chunks").forEach(chunk -> ((ObjectNode) chunk).put("rowsSha256", CanonicalRows.sha256(chunk.get("rows"))));
        return aliased;
    }
}
