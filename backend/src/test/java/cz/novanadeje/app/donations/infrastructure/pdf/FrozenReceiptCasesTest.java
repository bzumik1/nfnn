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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class FrozenReceiptCasesTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final List<String> NOT_INPUT = List.of("schemaVersion", "texts", "verification");
    private static final List<String> CASE_ONLY = List.of("v2Sample", "textsSha256");
    private static final String PRINTED_CASE_FILE = "receipts/v1/printed.json";
    private static final Pattern FOOTER = Pattern.compile("(.*· .*Číslo potvrzení: .*) [0-9]+ / [0-9]+");
    private static final Pattern CZECH_DATE = Pattern.compile("(?<![0-9])([0-9]{1,2})\\. ([0-9]{1,2})\\. ([0-9]{4})(?![0-9])");
    private static final Pattern HYPHEN_AFTER_LETTER = Pattern.compile("\\p{L}-$");
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
                            RecordedReceiptTextSource.of(sharedCase.input().get("textsSha256").asString()).textsFor(document.locale()), sample.signature().map(SignatureImage::digest),
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

    @TestFactory
    @DisplayName("Given every printed receipt case, when its text is derived from its v2 sample with the dates of D11, then the case holds that text")
    Stream<DynamicTest> should_hold_the_v2_text_with_the_d11_dates_when_derived_from_every_v2_sample() {
        Map<String, JsonNode> frozenCases = SharedCases.read(FrozenReceiptCases.CASE_FILE).cases().stream()
                .collect(Collectors.toMap(SharedCase::name, SharedCase::expected));
        return SharedCases.read(PRINTED_CASE_FILE).cases().stream().map(sharedCase -> DynamicTest.dynamicTest("Given " + sharedCase.name()
                + ", when its printed text is derived from its v2 sample with the dates of D11, then the printed case holds it", () -> {
            String sample = sharedCase.input().get("v2Sample").asString();
            JsonNode v2 = JSON.readTree(Files.readString(SharedCases.repositoryRoot().resolve(ReceiptCorpusTest.CORPUS).resolve(sample + ".json"),
                    StandardCharsets.UTF_8));
            JsonNode frozen = frozenCases.get(sharedCase.name());

            assertThat(frozen).isNotNull();
            assertThat(JSON.writeValueAsString(printed(v2, frozen))).isEqualTo(JSON.writeValueAsString(sharedCase.expected()));
        }));
    }

    private static ObjectNode printed(JsonNode v2, JsonNode frozen) {
        List<String> headerTexts = Stream.of("cs", "en")
                .map(locale -> frozen.get("texts").get(locale))
                .filter(texts -> texts != null && !texts.isNull())
                .flatMap(texts -> Stream.of(texts.get("receipt.table.receivedOn").asString(), texts.get("receipt.table.amount").asString()))
                .sorted(Comparator.comparingInt(String::length).reversed())
                .toList();
        boolean yearly = "YEARLY".equals(frozen.get("kind").asString());
        List<String> body = new ArrayList<>();
        List<String> header = new ArrayList<>();
        Set<String> footers = new LinkedHashSet<>();
        for (JsonNode page : v2.get("pages")) {
            for (JsonNode line : page.get("lines")) {
                String text = line.get("text").asString();
                Matcher footer = FOOTER.matcher(text);
                if (footer.matches()) {
                    footers.add(footer.group(1));
                } else if (yearly && onlyHeader(text, headerTexts)) {
                    if (page.get("number").asInt() == 1) {
                        header.add(text);
                    }
                } else {
                    body.add(text);
                }
            }
        }
        assertThat(footers).hasSize(1);
        ObjectNode printed = JSON.createObjectNode();
        printed.put("body", withD11Dates(normalised(joinedLines(body))));
        if (header.isEmpty()) {
            printed.putNull("tableHeader");
        } else {
            printed.put("tableHeader", normalised(String.join(" ", header)));
        }
        printed.put("footer", normalised(footers.iterator().next()));
        printed.put("v2Pages", v2.get("pages").size());
        return printed;
    }

    private static boolean onlyHeader(String line, List<String> headerTexts) {
        String rest = line;
        for (String headerText : headerTexts) {
            rest = rest.replace(headerText, " ");
        }
        return rest.isBlank();
    }

    private static String joinedLines(List<String> lines) {
        StringBuilder text = new StringBuilder();
        for (String line : lines) {
            if (!text.isEmpty() && !HYPHEN_AFTER_LETTER.matcher(text).find()) {
                text.append(' ');
            }
            text.append(line.strip());
        }
        return text.toString();
    }

    private static String normalised(String text) {
        return text.replace('\u00a0', ' ').replaceAll("\\s+", " ").strip();
    }

    private static String withD11Dates(String text) {
        return CZECH_DATE.matcher(text).replaceAll(date -> "%02d. %02d. %s".formatted(
                Integer.parseInt(date.group(1)), Integer.parseInt(date.group(2)), date.group(3)));
    }

    @Test
    @DisplayName("Given the frozen receipt cases, when they are read, then there is one for every sample of the v2 receipt corpus")
    void should_hold_one_case_per_v2_sample_when_read() {
        assertThat(SharedCases.read(FrozenReceiptCases.CASE_FILE).cases().stream().map(SharedCase::input).map(input -> input.get("v2Sample").asString()))
                .containsExactlyElementsOf(ReceiptCorpusTest.samples().stream().map(ReceiptCorpusTest.Sample::name).toList());
    }
}
