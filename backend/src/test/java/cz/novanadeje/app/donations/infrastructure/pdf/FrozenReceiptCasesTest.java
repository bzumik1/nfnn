package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.application.signing.ReceiptProofs;
import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceiptCases;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptVerification;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedReceipt;
import cz.novanadeje.app.donations.infrastructure.signing.Rfc8032Keys;
import cz.novanadeje.app.donations.infrastructure.texts.BundleReceiptTextSource;
import cz.novanadeje.app.donations.interfaces.rest.FrozenReceiptResponse;
import cz.novanadeje.app.regression.GoldenFiles;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCases;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class FrozenReceiptCasesTest {

    private static final String CASE_PATH = "shared-cases/" + FrozenReceiptCases.CASE_FILE;
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final String LOGIC = "The frozen receipt v1 (plan v3 D10, slice 1.6): what POST /api/donations/me/receipts and GET /api/donations/me/receipts/{id}"
            + " answer as receipt, and what issued_receipt keeps of each issued receipt for good. One case per sample of the v2 receipt corpus"
            + " (input.v2Sample names regression/v2/receipts/<sample>.json): the input is the receipt as the issuer puts it together (kind, number, day of issue,"
            + " language, year of a yearly receipt, the receipt it replaces, the foundation, the donor, the gifts in the order v2 lists them, the total,"
            + " the signatory and the digest of the signature image, or null); the expected value adds schemaVersion 1, the receipt texts frozen at issue"
            + " (texts.cs always, texts.en exactly for an English receipt, every receipt.* key of the message bundles but the file names) and the verification:"
            + " the id of the key that signed it (the backend signs with the RFC 8032 test 1 seed its tests hold, never a key of a server) and the QR text of its"
            + " proof (shared-cases/verification/payload.json, every gift always). Amounts are hellers, days ISO dates; the foundation's and the donor's values"
            + " are those the receipt certifies, so a later change of either never alters an issued receipt. From the frozen receipt alone the v2 receipt data"
            + " (the sample's data) follows word for word, which the browser's PDF of slice 1.9 renders.";

    private final ReceiptSigner signer = Rfc8032Keys.test1Signer();
    private final ReceiptProofs proofs = new ReceiptProofs(signer, Receipts.FOUNDATION);
    private final BundleReceiptTextSource texts = new BundleReceiptTextSource();

    @Test
    @DisplayName("Given the v2 receipt corpus, when every sample is frozen with the bundle's texts and signed with the 1.5 proof, then it gives the frozen receipt cases")
    void should_give_the_frozen_receipt_cases_when_every_v2_sample_is_frozen_and_signed() {
        ObjectNode file = NODES.objectNode();
        file.put("source", SharedCases.EDITED);
        file.put("logic", LOGIC);
        ArrayNode cases = file.putArray("cases");
        for (ReceiptCorpusTest.Sample sample : ReceiptCorpusTest.samples()) {
            ReceiptDocument document = sample.document();
            FrozenReceipt frozen = new FrozenReceipt(document, texts.textsFor(document.locale()), sample.signature().map(SignatureImage::digest),
                    new ReceiptVerification(signer.keyId(), proofs.prove(SignedReceipt.of(document))));
            ObjectNode expected = JSON.valueToTree(FrozenReceiptResponse.from(frozen));
            ObjectNode input = NODES.objectNode().put("v2Sample", sample.name());
            expected.properties().stream().filter(field -> !field.getKey().equals("schemaVersion") && !field.getKey().equals("texts")
                    && !field.getKey().equals("verification")).forEach(field -> input.set(field.getKey(), field.getValue()));
            ObjectNode sharedCase = cases.addObject();
            sharedCase.put("name", sample.description());
            sharedCase.set("input", input);
            sharedCase.set("expected", expected);
        }

        GoldenFiles.assertMatches(CASE_PATH, file);
    }

    @TestFactory
    @DisplayName("Given every frozen receipt case, when the v2 receipt data is put together from the frozen receipt alone, then it equals the data v2 froze for that sample")
    Stream<DynamicTest> should_equal_the_v2_data_when_put_together_from_every_frozen_receipt_case() {
        return SharedCases.read(FrozenReceiptCases.CASE_FILE).cases().stream().map(sharedCase -> DynamicTest.dynamicTest(sharedCase.name(), () -> {
            JsonNode frozen = sharedCase.expected();
            String sample = sharedCase.input().get("v2Sample").asString();
            JsonNode v2 = JSON.readTree(Files.readString(SharedCases.repositoryRoot().resolve(ReceiptCorpusTest.CORPUS).resolve(sample + ".json"),
                    StandardCharsets.UTF_8));
            Object data = ReceiptData.of(FrozenReceiptCases.documentOf(frozen),
                    new ReceiptTexts(FrozenReceiptCases.czechTextsOf(frozen), LocaleCode.CS.toLocale()));

            JsonNode putTogether = JSON.valueToTree(data);

            assertThat(putTogether).isEqualTo(v2.get("data"));
            assertThat(FrozenReceiptCases.signatureImageOf(frozen).isPresent()).isEqualTo(v2.get("renderer").get("signatureImage").asBoolean());
        }));
    }

    @Test
    @DisplayName("Given the frozen receipt cases, when they are read, then there is one for every sample of the v2 receipt corpus")
    void should_hold_one_case_per_v2_sample_when_read() {
        assertThat(SharedCases.read(FrozenReceiptCases.CASE_FILE).cases().stream().map(SharedCase::input).map(input -> input.get("v2Sample").asString()))
                .containsExactlyElementsOf(ReceiptCorpusTest.samples().stream().map(ReceiptCorpusTest.Sample::name).toList());
    }
}
