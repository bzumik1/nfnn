package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.AdministrationCopyCaseRunner;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCase;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class AdminPaymentListSharedCasesTest extends AdministrationCopyCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final List<String> QUERY_PARAMETERS = List.of("pairing", "year", "query", "from", "to", "offset", "limit");

    @Override
    protected String caseFile() {
        return "admin-payments/list.json";
    }

    @Override
    protected List<String> copiedKinds() {
        return List.of("donations/payments", "donations/donations", "donations/donor-records", "donations/receipts");
    }

    @Override
    protected String when() {
        return "when the backend reads the rows with the real queries and an administrator lists the payments with each query";
    }

    @Override
    protected String then() {
        return "then the device copy holds the case's chunks and each list is the expected one";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        JsonNode input = sharedCase.input();
        CaseRows rows = writeRowsAndAdministrator(input);
        assertTheCopyIsTheInputs(rows, input);
        ArrayNode answers = NODES.arrayNode();
        for (JsonNode query : input.get("queries")) {
            MockHttpServletRequestBuilder call = get("/api/admin/donations/payments");
            for (String parameter : QUERY_PARAMETERS) {
                if (query.has(parameter)) {
                    call = call.param(parameter, query.get(parameter).asString());
                }
            }
            if (query.has("donor")) {
                call = call.param("donorId", rows.donorId(query.get("donor").asString()).toString());
            }
            answers.add(rows.aliased(asAdministrator(call)));
        }
        ObjectNode given = NODES.objectNode();
        given.set("answers", answers);
        assertGives(given, sharedCase.expected());
    }
}
