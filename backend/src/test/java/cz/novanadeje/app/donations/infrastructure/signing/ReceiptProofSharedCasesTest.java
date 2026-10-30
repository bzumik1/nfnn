package cz.novanadeje.app.donations.infrastructure.signing;

import cz.novanadeje.app.donations.application.signing.ReceiptProofs;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.proof.InvalidReceiptProof;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProof;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofBody;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofMessage;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofReader;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptTooLong;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedDonor;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedGift;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedReceipt;
import cz.novanadeje.app.donations.domain.receipt.proof.VerificationQrSymbol;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.Year;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReceiptProofSharedCasesTest extends SharedCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final HexFormat HEX = HexFormat.of();
    private static final String REVOKED = "revoked";

    private final Ed25519ReceiptSigner signer = Rfc8032Keys.test1();

    @Override
    protected String caseFile() {
        return "verification/payload.json";
    }

    @Override
    protected String when() {
        return "when the backend signs the receipt into its proof or reads the proof back against the listed keys";
    }

    @Override
    protected String then() {
        return "then it gives the expected bytes, signature, text and QR symbol, or the expected verdict";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        JsonNode input = sharedCase.input();
        JsonNode actual = input.has("receipt") ? encoded(input) : read(input);

        assertGives(actual, sharedCase.expected());
    }

    private JsonNode encoded(JsonNode input) throws Exception {
        assertThat(signer.keyId().value()).as("the case signs with RFC 8032 test 1").isEqualTo(input.get("signingKeyId").asString());
        String foundation = input.get("foundation").get("companyIdentifier").asString();
        assertThat(foundation).isEqualTo(Receipts.FOUNDATION.companyIdentifier());
        SignedReceipt receipt = receiptOf(input.get("receipt"));
        byte[] body = ReceiptProofBody.encode(receipt, signer.keyId());
        byte[] message = ReceiptProofMessage.of(foundation, body);
        ReceiptProof proof = new ReceiptProof(body, signer.sign(message));
        ObjectNode answer = NODES.objectNode()
                .put("payloadHex", HEX.formatHex(body))
                .put("signatureHex", HEX.formatHex(proof.signature()))
                .put("signedSha256", HEX.formatHex(MessageDigest.getInstance("SHA-256").digest(message)))
                .put("qrText", proof.text());
        ReceiptProofs proofs = new ReceiptProofs(signer, Receipts.FOUNDATION);
        Optional<VerificationQrSymbol> symbol = VerificationQrSymbol.of(proof.text());
        if (symbol.isPresent()) {
            answer.putObject("qr").put("version", symbol.get().version()).put("errorCorrection", symbol.get().errorCorrection().name());
            assertThat(proofs.prove(receipt)).isEqualTo(proof);
        } else {
            answer.putObject("qr").put("refusal", ReceiptTooLong.CODE);
            assertThatThrownBy(() -> proofs.prove(receipt)).isInstanceOfSatisfying(ReceiptTooLong.class,
                    refused -> assertThat(refused.code()).isEqualTo(ReceiptTooLong.CODE));
        }
        return answer;
    }

    private JsonNode read(JsonNode input) {
        List<ReceiptProofReader.KnownKey> keys = input.get("keys").values().stream()
                .map(key -> new ReceiptProofReader.KnownKey(new ReceiptSigningKeyId(key.get("keyId").asString()), HEX.parseHex(key.get("publicKeyHex").asString()),
                        REVOKED.equals(key.get("status").asString())))
                .toList();
        Function<ReceiptSigningKeyId, Optional<ReceiptProofReader.KnownKey>> lookup = keyId -> keys.stream().filter(key -> key.id().equals(keyId)).findFirst();
        try {
            ReceiptProofReader.ReadProof proof = ReceiptProofReader.read(input.get("qrText").asString(), input.get("foundation").get("companyIdentifier").asString(),
                    lookup, signer);
            ObjectNode answer = NODES.objectNode().put("verdict", "valid").put("keyId", proof.keyId().value());
            answer.set("receipt", jsonOf(proof.receipt()));
            return answer;
        } catch (InvalidReceiptProof rejected) {
            return NODES.objectNode().put("verdict", "rejected").put("reason", rejected.rejection().code());
        }
    }

    private static SignedReceipt receiptOf(JsonNode receipt) {
        JsonNode donor = receipt.get("donor");
        JsonNode replaces = receipt.get("replaces");
        return new SignedReceipt(
                ReceiptKind.valueOf(receipt.get("kind").asString().toUpperCase(Locale.ROOT)),
                new ReceiptNumber(receipt.get("number").asString()),
                LocalDate.parse(receipt.get("issuedOn").asString()),
                receipt.get("year").isNull() ? Optional.empty() : Optional.of(Year.of(receipt.get("year").asInt())),
                replaces.isNull() ? Optional.empty()
                        : Optional.of(new ReplacedReceipt(new ReceiptNumber(replaces.get("number").asString()), LocalDate.parse(replaces.get("issuedOn").asString()))),
                new SignedDonor(DonorType.valueOf(donor.get("type").asString().toUpperCase(Locale.ROOT)), donor.get("name").asString(),
                        donor.get("street").asString(), donor.get("city").asString(), donor.get("postalCode").asString(),
                        donor.get("companyIdentifier").isNull() ? Optional.empty() : Optional.of(donor.get("companyIdentifier").asString())),
                receipt.get("gifts").values().stream()
                        .map(gift -> new SignedGift(LocalDate.parse(gift.get("receivedOn").asString()), gift.get("amountMinor").asLong()))
                        .toList(),
                receipt.get("totalMinor").asLong());
    }

    private static ObjectNode jsonOf(SignedReceipt receipt) {
        ObjectNode json = NODES.objectNode()
                .put("kind", receipt.kind().name().toLowerCase(Locale.ROOT))
                .put("number", receipt.number().value())
                .put("issuedOn", receipt.issuedOn().toString());
        if (receipt.year().isPresent()) {
            json.put("year", receipt.year().get().getValue());
        } else {
            json.putNull("year");
        }
        if (receipt.replaces().isPresent()) {
            json.putObject("replaces").put("number", receipt.replaces().get().number().value())
                    .put("issuedOn", receipt.replaces().get().issuedOn().toString());
        } else {
            json.putNull("replaces");
        }
        SignedDonor donor = receipt.donor();
        ObjectNode donorJson = json.putObject("donor")
                .put("type", donor.type().name().toLowerCase(Locale.ROOT))
                .put("name", donor.name())
                .put("street", donor.street())
                .put("city", donor.city())
                .put("postalCode", donor.postalCode());
        if (donor.companyIdentifier().isPresent()) {
            donorJson.put("companyIdentifier", donor.companyIdentifier().get());
        } else {
            donorJson.putNull("companyIdentifier");
        }
        var gifts = json.putArray("gifts");
        receipt.gifts().forEach(gift -> gifts.addObject().put("receivedOn", gift.receivedOn().toString()).put("amountMinor", gift.amountMinor()));
        json.put("totalMinor", receipt.totalMinor());
        return json;
    }
}
