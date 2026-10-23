package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSnapshot;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.FOUNDATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SIGNATORY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.acme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.janaSpeakingEnglish;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromAcme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

class ReceiptTemplateHistoryTest {

    private static final Path HISTORY = Path.of("src/test/resources/receipts/history");
    private static final Path CANDIDATE = Path.of("build/receipt-history");
    private static final String TEMPLATE_FILE = "template.json";
    private static final String DATA_SUFFIX = ".data.json";
    private static final String TEXT_SUFFIX = ".txt";
    private static final Instant ISSUED_AT = Instant.parse("2027-01-15T09:30:00Z");
    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final Donation JUNE = receivedFromJana(LocalDate.of(2026, 6, 1), 125050);

    private final ReceiptImage logo = new ReceiptImage(classpathBytes("receipt/logo.png"), "image/png");

    @Test
    @DisplayName("Given the receipt template on the classpath, when the history is read, then it is recorded with its sample receipts")
    void should_be_recorded_when_history_is_read_given_current_template() throws IOException {
        ReceiptTemplate current = ReceiptTemplate.fromClasspath();
        Path recorded = HISTORY.resolve(current.digest().value());
        if (Files.isDirectory(recorded)) {
            return;
        }
        Path candidate = writeCandidate(current);
        fail("The receipt template or its texts changed, and receipts already issued keep the template they were issued with."
                + " Review the sample texts in " + candidate.toAbsolutePath()
                + ", then copy that folder into backend/" + HISTORY + " and commit it, so the new template stays renderable for good.");
    }

    @Test
    @DisplayName("Given render profile 1, when its fonts are read, then they are the fonts every receipt of that profile was laid out with")
    void should_keep_fonts_of_profile_when_read_given_render_profile_1() {
        assertThat(ThymeleafPdfReceiptRenderer.RENDER_PROFILE)
                .as("a new render profile pins its own fonts here and keeps rendering profile 1 with these")
                .isEqualTo(1);
        assertThat(ContentDigest.of(classpathBytes("fonts/DejaVuSans.ttf")).value())
                .isEqualTo("ae7b7855e115a5966d8b1b3f80f254ccc117ec86f9965e202ee2940453837280");
        assertThat(ContentDigest.of(classpathBytes("fonts/DejaVuSans-Bold.ttf")).value())
                .isEqualTo("5c1247acef7f2b8522a31742c76d6adcb5569bacc0be7ceaa4dc39dd252ce895");
    }

    @TestFactory
    @DisplayName("Given every recorded template, when its sample receipts are rendered from the stored data, then they read word for word as when issued")
    Stream<DynamicTest> should_read_as_issued_when_rendered_given_every_recorded_template() throws IOException {
        List<DynamicTest> tests = new ArrayList<>();
        try (Stream<Path> templates = Files.list(HISTORY)) {
            for (Path folder : templates.sorted().toList()) {
                String content = Files.readString(folder.resolve(TEMPLATE_FILE), StandardCharsets.UTF_8);
                ContentDigest digest = ContentDigest.of(content.getBytes(StandardCharsets.UTF_8));
                tests.add(DynamicTest.dynamicTest(folder.getFileName() + " is the digest of its template",
                        () -> assertThat(digest.value()).isEqualTo(folder.getFileName().toString())));
                try (Stream<Path> files = Files.list(folder)) {
                    for (Path data : files.filter(file -> file.getFileName().toString().endsWith(DATA_SUFFIX)).sorted().toList()) {
                        String sample = data.getFileName().toString().replace(DATA_SUFFIX, "");
                        tests.add(DynamicTest.dynamicTest(folder.getFileName() + " / " + sample,
                                () -> assertThat(pageTexts(renderRecorded(content, Files.readString(data, StandardCharsets.UTF_8))))
                                        .containsExactlyElementsOf(Files.readAllLines(folder.resolve(sample + TEXT_SUFFIX), StandardCharsets.UTF_8))));
                    }
                }
            }
        }
        assertThat(tests).as("recorded templates").isNotEmpty();
        return tests.stream();
    }

    private Path writeCandidate(ReceiptTemplate current) throws IOException {
        Path folder = CANDIDATE.resolve(current.digest().value());
        Files.createDirectories(folder);
        Files.writeString(folder.resolve(TEMPLATE_FILE), current.content(), StandardCharsets.UTF_8);
        InMemoryReceiptResources resources = new InMemoryReceiptResources();
        ThymeleafPdfReceiptRenderer renderer = renderer(resources, current);
        for (Map.Entry<String, ReceiptDocument> sample : samples().entrySet()) {
            ReceiptSnapshot snapshot = renderer.freeze(sample.getValue());
            Files.writeString(folder.resolve(sample.getKey() + DATA_SUFFIX), snapshot.data(), StandardCharsets.UTF_8);
            byte[] pdf = renderer.render(snapshot, sample.getValue().number(), ISSUED_AT);
            Files.write(folder.resolve(sample.getKey() + TEXT_SUFFIX), pageTexts(pdf), StandardCharsets.UTF_8);
        }
        return folder;
    }

    private byte[] renderRecorded(String templateContent, String data) {
        InMemoryReceiptResources resources = new InMemoryReceiptResources();
        ContentDigest digest = ContentDigest.of(templateContent.getBytes(StandardCharsets.UTF_8));
        resources.storeTemplate(digest, templateContent, NOW);
        resources.storeImage(logo.digest(), logo, NOW);
        ReceiptSnapshot snapshot = new ReceiptSnapshot(digest, data, logo.digest(), Optional.empty(), ThymeleafPdfReceiptRenderer.RENDER_PROFILE);
        return renderer(resources, ReceiptTemplate.fromClasspath()).render(snapshot, FIRST_NUMBER, ISSUED_AT);
    }

    private static ThymeleafPdfReceiptRenderer renderer(ReceiptResources resources, ReceiptTemplate template) {
        return new ThymeleafPdfReceiptRenderer(resources, template, InMemoryReceiptSignatures.holding(Optional.empty()), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static Map<String, ReceiptDocument> samples() {
        Map<String, ReceiptDocument> samples = new LinkedHashMap<>();
        samples.put("single-person-cs", Receipts.singleDocument(jana(), MARCH));
        samples.put("yearly-person-en", Receipts.yearlyDocument(janaSpeakingEnglish(), List.of(MARCH, JUNE)));
        samples.put("single-company-replacement-cs", ReceiptDocumentFactory.forDonation(acme(), receivedFromAcme(LocalDate.of(2026, 5, 5), 1000000),
                FOUNDATION, SIGNATORY, ReceiptNumber.of(Year.of(2027), 2), TODAY, LocaleCode.CS,
                Optional.of(new ReplacedReceipt(FIRST_NUMBER, LocalDate.of(2027, 1, 10)))));
        samples.put("yearly-person-many-gifts-cs", Receipts.yearlyDocument(jana(), IntStream.range(0, 120)
                .mapToObj(day -> receivedFromJana(LocalDate.of(2026, 1, 1).plusDays(day * 3L), 10000 + day))
                .toList()));
        return samples;
    }

    private static List<String> pageTexts(byte[] pdf) {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            List<String> pages = new ArrayList<>();
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                PDFTextStripper stripper = new PDFTextStripper();
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                pages.add(stripper.getText(document).replace(' ', ' ').replaceAll("\\s+", " ").strip());
            }
            return pages;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static byte[] classpathBytes(String path) {
        try {
            return new ClassPathResource(path).getContentAsByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
