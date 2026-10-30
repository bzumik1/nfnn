package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.cucumber.transcript.ApiTranscripts;
import cz.novanadeje.app.regression.GoldenFiles;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
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
import static org.assertj.core.api.Assertions.assertThat;

class ReceiptFormattingCasesTest {

    static final String CASES = "shared-cases/receipts/formatting.json";
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final List<Long> AMOUNTS = List.of(1L, 50L, 100L, 99900L, 50000L, 100000L, 100050L, 125050L, 1000000L, 99999999L, 100000000L,
            1234567890L);
    private static final List<String> DATES = List.of("2026-01-01", "2026-03-15", "2026-10-05", "2026-12-31", "2028-02-29", "2027-11-30");
    private static final List<Party> PARTIES = List.of(
            new Party("a person", false, "Jana Nováková", null, "Dlouhá 12", "Ústí nad Labem", "400 01"),
            new Party("a person whose fields carry spaces at both ends", false, "  Jana Nováková ", null, " Dlouhá 12 ", " Ústí nad Labem  ", " 400 01 "),
            new Party("a company with its identifier", true, "Acme Třebíč s.r.o.", "25596641", "Průmyslová 5", "Česká Lípa", "470 01"),
            new Party("a postal code without a space", false, "Eva Malá", null, "Krátká 3", "Děčín", "40502"),
            new Party("a person living abroad, the country in the city", false, "Lena Beispielová", null, "Hauptstraße 7", "Dresden, Německo", "01067"),
            new Party("every Czech letter with a diacritic", false, "Řehoř Ďáblík-Šťastný Žluťoučký", null, "Úvozní 1287/15a, áčďéěíňóřšťúůýž",
                    "Ústí nad Orlicí – ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ", "562 01"));

    @Test
    @DisplayName("Given the receipt formatting cases, when v2 formats them for a receipt, then the texts equal the recorded shared cases")
    void should_equal_the_recorded_shared_cases_when_v2_formats_the_receipt_cases() {
        GoldenFiles.assertMatches(CASES, cases());
    }

    @Test
    @DisplayName("Given the receipt formatting cases, when they are generated twice, then both runs give identical files")
    void should_give_identical_files_when_the_receipt_formatting_cases_are_generated_twice() {
        assertThat(GoldenFiles.canonical(cases())).isEqualTo(GoldenFiles.canonical(cases()));
    }

    @Test
    @DisplayName("Given a receipt date, when v2 formats it in Czech, then the day and month have no leading zero, unlike the web's dates")
    void should_print_day_and_month_without_a_leading_zero_when_v2_formats_a_receipt_date_in_czech() {
        assertThat(ReceiptFormats.czechDate(LocalDate.of(2026, 3, 5))).isEqualTo("5. 3. 2026");
    }

    private static ObjectNode cases() {
        ArrayNode cases = NODES.arrayNode();
        for (long amount : AMOUNTS) {
            cases.add(entry(hellers(amount) + " in Czech", input("czechAmount").put("amountMinor", amount),
                    ReceiptFormats.czechAmount(Money.czk(amount))));
            cases.add(entry(hellers(amount) + " in English", input("englishAmount").put("amountMinor", amount),
                    ReceiptFormats.englishAmount(Money.czk(amount))));
        }
        for (String date : DATES) {
            cases.add(entry(date + " in Czech", input("czechDate").put("date", date), ReceiptFormats.czechDate(LocalDate.parse(date))));
            cases.add(entry(date + " in English", input("englishDate").put("date", date), ReceiptFormats.englishDate(LocalDate.parse(date))));
        }
        for (Party party : PARTIES) {
            cases.add(partyCase(party));
        }
        ObjectNode file = NODES.objectNode();
        file.put("source", ApiTranscripts.SOURCE);
        file.put("logic", "How a v2 receipt prints amounts (ReceiptFormats: hellers as Czech crowns with U+00A0 as the thousands separator and before Kč, "
                + "hellers only when not whole; English as CZK with a comma and a point), dates (Czech d. M. yyyy without leading zeros, which the web's "
                + "15. 03. 2026 is not; English d MMMM yyyy) and the donor (ReceiptData from the donor record: trimmed name, identifier of a company, "
                + "address as street, postal code city). input.format names the formatter; expected.text or expected.donor is what the receipt's frozen data holds");
        file.set("cases", cases);
        return file;
    }

    private static ObjectNode partyCase(Party party) {
        ObjectNode input = input("donor").put("company", party.company()).put("name", party.name());
        if (party.identifier() == null) {
            input.putNull("companyIdentifier");
        } else {
            input.put("companyIdentifier", party.identifier());
        }
        input.put("street", party.street()).put("city", party.city()).put("postalCode", party.postalCode());
        ObjectNode expected = NODES.objectNode();
        expected.set("donor", donorFields(input));
        ObjectNode entry = NODES.objectNode();
        entry.put("name", party.label());
        entry.set("input", input);
        entry.set("expected", expected);
        return entry;
    }

    static ObjectNode donorFields(JsonNode input) {
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

    private static String hellers(long amount) {
        return amount == 1 ? "1 heller" : amount + " hellers";
    }

    private static ObjectNode input(String format) {
        return NODES.objectNode().put("format", format);
    }

    private static ObjectNode entry(String name, ObjectNode input, String text) {
        ObjectNode entry = NODES.objectNode();
        entry.put("name", name);
        entry.set("input", input);
        entry.putObject("expected").put("text", text);
        return entry;
    }

    private record Party(String label, boolean company, String name, String identifier, String street, String city, String postalCode) {
    }
}
