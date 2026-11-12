package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.AdministrationCopyCaseRunner;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCase;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class AdminDonorRecordSearchSharedCasesTest extends AdministrationCopyCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    @Override
    protected String caseFile() {
        return "admin-donors/record-search.json";
    }

    @Override
    protected List<String> copiedKinds() {
        return List.of("donations/donor-records");
    }

    @Override
    protected String when() {
        return "when the backend reads the donor records with the real query and an administrator searches them to pair a payment";
    }

    @Override
    protected String then() {
        return "then the device copy holds the case's chunks and each search finds the expected donors in the expected order";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        JsonNode input = sharedCase.input();
        CaseRows rows = writeRowsAndAdministrator(input);
        assertTheCopyIsTheInputs(rows, input);
        ArrayNode answers = NODES.arrayNode();
        for (JsonNode query : input.get("queries")) {
            answers.add(rows.aliased(asAdministrator(get("/api/admin/donations/donors").param("query", query.get("query").asString()))));
        }
        ObjectNode given = NODES.objectNode();
        given.set("answers", answers);
        assertGives(given, sharedCase.expected());
    }
}
