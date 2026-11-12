package cz.novanadeje.app.donations;

import cz.novanadeje.app.sharedcases.CaseRows;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

public abstract class AdministrationCopyCaseRunner extends DonationRowsSharedCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    protected abstract List<String> copiedKinds();

    protected CaseRows writeRowsAndAdministrator(JsonNode input) {
        CaseRows rows = writeRows(input);
        rows.writeAdministrator(jdbc());
        return rows;
    }

    protected JsonNode asAdministrator(MockHttpServletRequestBuilder call) throws Exception {
        return answerAs(CaseRows.administratorId(), "ROLE_ADMIN", call);
    }

    protected void assertTheCopyIsTheInputs(CaseRows rows, JsonNode input) throws Exception {
        ObjectNode copied = NODES.objectNode();
        for (String part : List.of("donations", "donors")) {
            List<String> kinds = copiedKinds().stream().filter(kind -> kind.startsWith(part + "/")).map(kind -> kind.substring(part.length() + 1)).toList();
            if (kinds.isEmpty()) {
                continue;
            }
            JsonNode manifest = asAdministrator(get("/api/admin/" + part + "/sync"));
            List<String> ids = manifest.get("chunks").valueStream().map(chunk -> chunk.get("id").asString())
                    .filter(id -> kinds.stream().anyMatch(kind -> id.equals(kind) || id.startsWith(kind + ":"))).toList();
            if (ids.isEmpty()) {
                continue;
            }
            JsonNode bodies = asAdministrator(get("/api/admin/" + part + "/sync/chunks").param("ids", String.join(",", ids)));
            assertThat(bodies.get("missing").isEmpty()).as("chunks the manifest listed went missing: %s", bodies.get("missing")).isTrue();
            bodies.get("chunks").forEach(chunk -> copied.set(part + "/" + chunk.get("id").asString(), rows.aliased(chunk.get("rows"))));
            if (part.equals("donations") && input.has("summary")) {
                ObjectNode summary = NODES.objectNode();
                input.get("summary").properties().forEach(field -> summary.set(field.getKey(), manifest.get("summary").get(field.getKey())));
                assertGives(summary, input.get("summary"));
            }
        }
        assertGives(copied, input.get("chunks"));
    }

    protected static UUID administrator() {
        return CaseRows.administratorId();
    }
}
