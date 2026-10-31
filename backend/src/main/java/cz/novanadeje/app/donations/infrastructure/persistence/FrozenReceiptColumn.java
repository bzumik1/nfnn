package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptLine;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptParty;
import cz.novanadeje.app.donations.domain.receipt.ReceiptTextSet;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.time.LocalDate;
import java.time.Year;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.UUID;

final class FrozenReceiptColumn {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    private FrozenReceiptColumn() {
    }

    static String write(FrozenReceipt frozen) {
        ReceiptDocument document = frozen.document();
        ObjectNode root = NODES.objectNode();
        root.put("schemaVersion", frozen.schemaVersion());
        root.put("kind", document.kind().name());
        root.put("number", document.number().value());
        root.put("issuedOn", document.issuedOn().toString());
        root.put("locale", document.locale().tag());
        document.year().ifPresentOrElse(year -> root.put("year", year.getValue()), () -> root.putNull("year"));
        document.replaces().ifPresentOrElse(replaced -> root.putObject("replaces")
                .put("number", replaced.number().value())
                .put("issuedOn", replaced.issuedOn().toString()), () -> root.putNull("replaces"));
        FoundationIdentity foundation = document.foundation();
        ObjectNode foundationNode = root.putObject("foundation")
                .put("name", foundation.name())
                .put("companyIdentifier", foundation.companyIdentifier());
        address(foundationNode, foundation.address());
        foundationNode.put("registryCourt", foundation.registryCourt())
                .put("registryFile", foundation.registryFile())
                .put("bankAccountNumber", foundation.bankAccountNumber())
                .put("issuePlace", foundation.issuePlace())
                .put("issuePlaceEn", foundation.issuePlaceEn());
        ReceiptParty donor = document.donor();
        ObjectNode donorNode = root.putObject("donor")
                .put("type", donor.type().name())
                .put("name", donor.name())
                .put("companyIdentifier", donor.companyIdentifier().orElse(null));
        address(donorNode, donor.address());
        donorNode.put("variableSymbol", donor.variableSymbol().value());
        ArrayNode gifts = root.putArray("gifts");
        document.lines().forEach(line -> gifts.addObject()
                .put("donationId", line.donationId().value().toString())
                .put("receivedOn", line.receivedOn().toString())
                .put("amountMinor", line.amount().amountMinor())
                .put("currency", line.amount().currency().name())
                .put("source", line.source().name()));
        root.putObject("total")
                .put("amountMinor", document.total().amountMinor())
                .put("currency", document.total().currency().name());
        root.putObject("signatory")
                .put("name", document.signatory().name())
                .put("role", document.signatory().role());
        ObjectNode texts = root.putObject("texts");
        texts.set("cs", texts(frozen.texts().czech()));
        frozen.texts().english().ifPresentOrElse(english -> texts.set("en", texts(english)), () -> texts.putNull("en"));
        return JSON.writeValueAsString(root);
    }

    static ReceiptDocument document(String column) {
        JsonNode root = JSON.readTree(column);
        if (root.get("schemaVersion").asInt() != FrozenReceipt.SCHEMA_VERSION) {
            throw new IllegalStateException("A frozen receipt of schema version " + root.get("schemaVersion") + " is not readable here");
        }
        JsonNode foundation = root.get("foundation");
        JsonNode donor = root.get("donor");
        List<ReceiptLine> lines = new ArrayList<>();
        root.get("gifts").forEach(gift -> lines.add(new ReceiptLine(new DonationId(UUID.fromString(gift.get("donationId").asString())),
                LocalDate.parse(gift.get("receivedOn").asString()),
                new Money(gift.get("amountMinor").asLong(), Currency.fromCode(gift.get("currency").asString())),
                DonationSource.valueOf(gift.get("source").asString()))));
        JsonNode total = root.get("total");
        JsonNode replaces = root.get("replaces");
        return new ReceiptDocument(
                ReceiptKind.valueOf(root.get("kind").asString()),
                new ReceiptNumber(root.get("number").asString()),
                LocalDate.parse(root.get("issuedOn").asString()),
                LocaleCode.fromTag(root.get("locale").asString()),
                new FoundationIdentity(foundation.get("name").asString(), foundation.get("companyIdentifier").asString(), address(foundation),
                        foundation.get("registryCourt").asString(), foundation.get("registryFile").asString(),
                        foundation.get("bankAccountNumber").asString(), foundation.get("issuePlace").asString(),
                        foundation.get("issuePlaceEn").asString()),
                new ReceiptParty(DonorType.valueOf(donor.get("type").asString()), donor.get("name").asString(), address(donor),
                        optionalText(donor.get("companyIdentifier")), new VariableSymbol(donor.get("variableSymbol").asString())),
                lines,
                new Money(total.get("amountMinor").asLong(), Currency.fromCode(total.get("currency").asString())),
                root.get("year").isNull() ? Optional.empty() : Optional.of(Year.of(root.get("year").asInt())),
                new Signatory(root.get("signatory").get("name").asString(), root.get("signatory").get("role").asString()),
                replaces.isNull() ? Optional.empty()
                        : Optional.of(new ReplacedReceipt(new ReceiptNumber(replaces.get("number").asString()),
                        LocalDate.parse(replaces.get("issuedOn").asString()))));
    }

    static ReceiptTextSet texts(String column) {
        JsonNode texts = JSON.readTree(column).get("texts");
        JsonNode english = texts.get("en");
        return new ReceiptTextSet(texts(texts.get("cs")), english.isNull() ? Optional.empty() : Optional.of(texts(english)));
    }

    private static void address(ObjectNode node, PostalAddress address) {
        node.putObject("address")
                .put("street", address.street())
                .put("city", address.city())
                .put("postalCode", address.postalCode());
    }

    private static PostalAddress address(JsonNode node) {
        JsonNode address = node.get("address");
        return new PostalAddress(address.get("street").asString(), address.get("city").asString(), address.get("postalCode").asString());
    }

    private static Optional<String> optionalText(JsonNode node) {
        return node == null || node.isNull() ? Optional.empty() : Optional.of(node.asString());
    }

    private static ObjectNode texts(Map<String, String> texts) {
        ObjectNode node = NODES.objectNode();
        texts.forEach(node::put);
        return node;
    }

    private static SortedMap<String, String> texts(JsonNode node) {
        SortedMap<String, String> texts = new TreeMap<>();
        node.properties().forEach(entry -> texts.put(entry.getKey(), entry.getValue().asString()));
        return texts;
    }
}
