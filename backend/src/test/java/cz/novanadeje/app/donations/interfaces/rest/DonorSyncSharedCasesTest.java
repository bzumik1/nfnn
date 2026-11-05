package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.DonationRowsSharedCaseRunner;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.shared.infrastructure.json.CanonicalRows;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class DonorSyncSharedCasesTest extends DonationRowsSharedCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    @Autowired
    private FirstReceiptYear firstReceiptYear;

    @Override
    protected String caseFile() {
        return "sync/manifest.json";
    }

    @Override
    protected String when() {
        return "when the backend reads the donor's rows with the real queries and answers the manifest and every chunk it lists";
    }

    @Override
    protected String then() {
        return "then the donor gets the expected manifest with the rows of each chunk";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        JsonNode input = sharedCase.input();
        assertThat(firstReceiptYear.year().getValue()).as("the first receipt year this runner's backend is configured with")
                .isEqualTo(input.get("firstReceiptYear").asInt());
        CaseRows rows = writeRows(input);
        if (!input.get("bankDataAsOf").isNull()) {
            jdbc().sql("insert into bank_import_state (id, last_attempted_at, last_succeeded_at, updated_at) values (1, :at, :at, :at)")
                    .param("at", CaseRows.timestamp(input.get("bankDataAsOf").asString()))
                    .update();
        }
        UUID donor = rows.donorId(input.get("donor").asString());

        JsonNode manifest = answerAs(donor, "ROLE_DONOR", get("/api/donations/me/sync"));
        List<String> ids = manifest.get("chunks").valueStream().map(chunk -> chunk.get("id").asString()).toList();
        ArrayNode chunks = NODES.arrayNode();
        if (!ids.isEmpty()) {
            JsonNode bodies = answerAs(donor, "ROLE_DONOR", get("/api/donations/me/sync/chunks").param("ids", String.join(",", ids)));
            assertThat(bodies.get("subject")).isEqualTo(manifest.get("subject"));
            assertThat(bodies.get("missing").isEmpty()).as("chunks the manifest listed went missing: %s", bodies.get("missing")).isTrue();
            assertThat(bodies.get("chunks").size()).isEqualTo(ids.size());
            for (int index = 0; index < ids.size(); index++) {
                JsonNode listed = manifest.get("chunks").get(index);
                JsonNode body = bodies.get("chunks").get(index);
                assertThat(body.get("id")).isEqualTo(listed.get("id"));
                assertThat(body.get("rowsSha256")).as("the body of %s and its manifest entry", listed.get("id")).isEqualTo(listed.get("rowsSha256"));
                assertThat(body.get("count")).isEqualTo(listed.get("count"));
                assertThat(CanonicalRows.sha256(body.get("rows"))).as("the SHA-256 of the canonical rows of %s as answered", listed.get("id"))
                        .isEqualTo(body.get("rowsSha256").asString());
                chunks.add(body);
            }
        }
        ObjectNode joined = NODES.objectNode();
        joined.set("subject", manifest.get("subject"));
        joined.set("summary", manifest.get("summary"));
        joined.set("chunks", chunks);

        assertGives(withCaseDigests(rows.aliased(joined)), sharedCase.expected());
    }

    private static JsonNode withCaseDigests(JsonNode aliased) {
        aliased.get("chunks").forEach(chunk -> ((ObjectNode) chunk).put("rowsSha256", CanonicalRows.sha256(chunk.get("rows"))));
        return aliased;
    }
}
