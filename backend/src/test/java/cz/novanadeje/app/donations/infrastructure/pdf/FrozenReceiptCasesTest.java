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
import cz.novanadeje.app.donations.infrastructure.texts.RecordedReceiptTextSource;
import cz.novanadeje.app.donations.interfaces.rest.FrozenReceiptResponse;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCases;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class FrozenReceiptCasesTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final List<String> NOT_INPUT = List.of("schemaVersion", "texts", "verification");
    private static final List<String> CASE_ONLY = List.of("v2Sample", "textsSet");
    private final ReceiptSigner signer = Rfc8032Keys.test1Signer();
    private final ReceiptProofs proofs = new ReceiptProofs(signer, Receipts.FOUNDATION);

    @TestFactory
    @DisplayName("Given every frozen receipt case, when its v2 sample is put together as the issuer does, then the case's name and input are that sample's")
    Stream<DynamicTest> should_hold_the_sample_as_input_when_its_v2_sample_is_put_together() {
        Map<String, ReceiptCorpusTest.Sample> samples = ReceiptCorpusTest.samples().stream()
                .collect(Collectors.toMap(ReceiptCorpusTest.Sample::name, Function.identity()));
        return SharedCases.read(FrozenReceiptCases.CASE_FILE).cases().stream().map(sharedCase -> DynamicTest.dynamicTest(
                "Given " + sharedCase.name() + ", when its v2 sample is put together as the issuer does, then the case holds it as input", () -> {
                    ReceiptCorpusTest.Sample sample = samples.get(sharedCase.input().get("v2Sample").asString());
                    ReceiptDocument document = sample.document();
                    FrozenReceipt frozen = new FrozenReceipt(document,
                            RecordedReceiptTextSource.of(sharedCase.input().get("textsSet").asString()).textsFor(document.locale()), sample.signature().map(SignatureImage::digest),
                            new ReceiptVerification(signer.keyId(), proofs.prove(SignedReceipt.of(document))));
                    ObjectNode putTogether = (ObjectNode) JSON.readTree(JSON.writeValueAsString(FrozenReceiptResponse.from(frozen)));
                    putTogether.remove(NOT_INPUT);
                    ObjectNode input = (ObjectNode) sharedCase.input().deepCopy();
                    input.remove(CASE_ONLY);

                    assertThat(sharedCase.name()).isEqualTo(sample.description());
                    assertThat(input).isEqualTo(putTogether);
                }));
    }

    @TestFactory
    @DisplayName("Given every frozen receipt case, when the v2 receipt data is put together from the frozen receipt alone, then it equals the data v2 froze for that sample")
    Stream<DynamicTest> should_equal_the_v2_data_when_put_together_from_every_frozen_receipt_case() {
        return SharedCases.read(FrozenReceiptCases.CASE_FILE).cases().stream().map(sharedCase -> DynamicTest.dynamicTest("Given " + sharedCase.name()
                + ", when the v2 receipt data is put together from its frozen receipt alone, then it equals the data v2 froze for that sample", () -> {
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
