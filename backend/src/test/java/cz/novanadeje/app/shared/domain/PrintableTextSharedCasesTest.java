package cz.novanadeje.app.shared.domain;

import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

class PrintableTextSharedCasesTest extends SharedCaseRunner {

    @Override
    protected String caseFile() {
        return "receipts/printable.json";
    }

    @Override
    protected String when() {
        return "when the backend reads it as a receipt prints it";
    }

    @Override
    protected String then() {
        return "then it gives the printed text and the code points outside the printable set";
    }

    @Override
    protected void run(SharedCase sharedCase) {
        PrintableText printed = PrintableText.of(sharedCase.input().get("text").asString());

        ObjectNode actual = JsonNodeFactory.instance.objectNode().put("text", printed.text());
        ArrayNode outside = actual.putArray("outside");
        printed.outside().forEach(codePoint -> outside.add("U+%04X".formatted(codePoint)));
        assertGives(actual, sharedCase.expected());
    }
}
