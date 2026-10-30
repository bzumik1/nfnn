package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.FOUNDATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SIGNATORY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;

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
                result.set("donor", donorFields(input));
                yield result;
            }
            default -> throw new AssertionError("No receipt formatter is named " + format);
        };
    }

    private static ObjectNode donorFields(JsonNode input) {
        PostalAddress address = new PostalAddress(input.get("street").asString(), input.get("city").asString(), input.get("postalCode").asString());
        VariableSymbol symbol = new VariableSymbol("4821937560");
        String name = input.get("name").asString();
        DonorRecord record = input.get("company").asBoolean()
                ? DonorRecord.registerCompany(JANA, name, input.get("companyIdentifier").asString(), address, symbol, LocaleCode.CS, NOW)
                : DonorRecord.registerPerson(JANA, name, address, symbol, LocaleCode.CS, NOW);
        Map<String, Object> data = ReceiptData.of(ReceiptDocumentFactory.forDonation(record, receivedFromJana(LocalDate.of(2026, 3, 15), 50000), FOUNDATION,
                SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS, Optional.empty()), ReceiptTemplate.fromClasspath().texts(LocaleCode.CS));
        ObjectNode donor = NODES.objectNode();
        for (String field : List.of("company", "donorName", "donorIdentifier", "donorAddress")) {
            Object value = data.get(field);
            if (value == null) {
                donor.putNull(field);
            } else if (value instanceof Boolean flag) {
                donor.put(field, flag);
            } else {
                donor.put(field, value.toString());
            }
        }
        return donor;
    }
}
