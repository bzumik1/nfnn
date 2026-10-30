package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.time.LocalDate;

class ReceiptFormattingSharedCasesTest extends SharedCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    @Override
    protected String caseFile() {
        return "receipts/formatting.json";
    }

    @Override
    protected String when() {
        return "when the backend formats it for a receipt";
    }

    @Override
    protected String then() {
        return "then the receipt's frozen data holds the expected text";
    }

    @Override
    protected void run(SharedCase sharedCase) {
        assertGives(formatted(sharedCase.input()), sharedCase.expected());
    }

    private static ObjectNode formatted(JsonNode input) {
        String format = input.get("format").asString();
        ObjectNode result = NODES.objectNode();
        return switch (format) {
            case "czechAmount" -> result.put("text", ReceiptFormats.czechAmount(Money.czk(input.get("amountMinor").asLong())));
            case "englishAmount" -> result.put("text", ReceiptFormats.englishAmount(Money.czk(input.get("amountMinor").asLong())));
            case "czechDate" -> result.put("text", ReceiptFormats.czechDate(LocalDate.parse(input.get("date").asString())));
            case "englishDate" -> result.put("text", ReceiptFormats.englishDate(LocalDate.parse(input.get("date").asString())));
            case "donor" -> {
                result.set("donor", ReceiptFormattingCasesTest.donorFields(input));
                yield result;
            }
            default -> throw new AssertionError("No receipt formatter is named " + format);
        };
    }
}
