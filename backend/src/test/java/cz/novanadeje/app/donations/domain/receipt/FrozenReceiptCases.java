package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.Year;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.UUID;

public final class FrozenReceiptCases {

    public static final String CASE_FILE = "receipts/v1/frozen.json";

    private FrozenReceiptCases() {
    }

    public static ReceiptDocument documentOf(JsonNode receipt) {
        JsonNode foundation = receipt.get("foundation");
        JsonNode donor = receipt.get("donor");
        JsonNode replaces = receipt.get("replaces");
        List<ReceiptLine> lines = new ArrayList<>();
        JsonNode gifts = receipt.get("gifts");
        for (int index = 0; index < gifts.size(); index++) {
            JsonNode gift = gifts.get(index);
            lines.add(new ReceiptLine(new DonationId(new UUID(0, index + 1L)), LocalDate.parse(gift.get("receivedOn").asString()),
                    Money.czk(gift.get("amountMinor").asLong()), DonationSource.valueOf(gift.get("source").asString())));
        }
        JsonNode total = receipt.get("total");
        return new ReceiptDocument(ReceiptKind.valueOf(receipt.get("kind").asString()), new ReceiptNumber(receipt.get("number").asString()),
                LocalDate.parse(receipt.get("issuedOn").asString()), LocaleCode.fromTag(receipt.get("locale").asString()),
                new FoundationIdentity(foundation.get("name").asString(), foundation.get("companyIdentifier").asString(), addressOf(foundation),
                        foundation.get("registryCourt").asString(), foundation.get("registryFile").asString(),
                        foundation.get("bankAccountNumber").asString(), foundation.get("issuePlace").asString(),
                        foundation.get("issuePlaceEn").asString()),
                new ReceiptParty(DonorType.valueOf(donor.get("type").asString()), donor.get("name").asString(), addressOf(donor),
                        donor.get("companyIdentifier").isNull() ? Optional.empty() : Optional.of(donor.get("companyIdentifier").asString()),
                        new VariableSymbol(donor.get("variableSymbol").asString())),
                lines, new Money(total.get("amountMinor").asLong(), Currency.fromCode(total.get("currency").asString())),
                receipt.get("year").isNull() ? Optional.empty() : Optional.of(Year.of(receipt.get("year").asInt())),
                new Signatory(receipt.get("signatory").get("name").asString(), receipt.get("signatory").get("role").asString()),
                replaces.isNull() ? Optional.empty()
                        : Optional.of(new ReplacedReceipt(new ReceiptNumber(replaces.get("number").asString()),
                        LocalDate.parse(replaces.get("issuedOn").asString()))));
    }

    public static Optional<ContentDigest> signatureImageOf(JsonNode receipt) {
        JsonNode image = receipt.get("signatory").get("signatureImage");
        return image.isNull() ? Optional.empty() : Optional.of(new ContentDigest(image.get("sha256").asString()));
    }

    public static SortedMap<String, String> czechTextsOf(JsonNode receipt) {
        SortedMap<String, String> texts = new TreeMap<>();
        receipt.get("texts").get("cs").properties().forEach(entry -> texts.put(entry.getKey(), entry.getValue().asString()));
        return texts;
    }

    private static PostalAddress addressOf(JsonNode owner) {
        JsonNode address = owner.get("address");
        return new PostalAddress(address.get("street").asString(), address.get("city").asString(), address.get("postalCode").asString());
    }
}
