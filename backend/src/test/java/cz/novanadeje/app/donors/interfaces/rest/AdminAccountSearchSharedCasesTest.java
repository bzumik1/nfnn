package cz.novanadeje.app.donors.interfaces.rest;

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

class AdminAccountSearchSharedCasesTest extends AdministrationCopyCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final List<String> QUERY_PARAMETERS = List.of("query", "page", "limit");

    @Override
    protected String caseFile() {
        return "admin-donors/account-search.json";
    }

    @Override
    protected List<String> copiedKinds() {
        return List.of("donors/accounts");
    }

    @Override
    protected String when() {
        return "when the backend reads the accounts with the real query and an administrator searches them on Dárci";
    }

    @Override
    protected String then() {
        return "then the device copy holds the case's chunks and each search gives the expected page of accounts";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        JsonNode input = sharedCase.input();
        CaseRows rows = writeRowsAndAdministrator(input);
        assertTheCopyIsTheInputs(rows, input);
        ArrayNode answers = NODES.arrayNode();
        for (JsonNode query : input.get("queries")) {
            MockHttpServletRequestBuilder call = get("/api/admin/donors");
            for (String parameter : QUERY_PARAMETERS) {
                if (query.has(parameter)) {
                    call = call.param(parameter, query.get(parameter).asString());
                }
            }
            answers.add(rows.aliased(asAdministrator(call)));
        }
        ObjectNode given = NODES.objectNode();
        given.set("answers", answers);
        assertGives(given, sharedCase.expected());
    }
}
