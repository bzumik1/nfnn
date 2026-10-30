package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSnapshot;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.cucumber.transcript.ApiTranscripts;
import cz.novanadeje.app.regression.GoldenFiles;
import cz.novanadeje.app.sharedcases.SharedCases;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.FOUNDATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SIGNATORY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.acme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.janaSpeakingEnglish;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromAcme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.refundedToJana;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReceiptCorpusTest {

    static final String CORPUS = "regression/v2/receipts";
    static final String REFUSALS = CORPUS + "/refusals.json";
    static final String DIGESTS = CORPUS + "/digests.json";
    private static final Path HISTORY = Path.of("src/test/resources/receipts/history");
    private static final Path PREVIEW = Path.of("build/receipt-corpus");
    private static final String HISTORY_TEMPLATE = "7b30974aef2fdaf01f6e4990c8c4b526a0de8d8371452023be783677b69bf7e7";
    private static final Instant ISSUED_AT = Instant.parse("2027-01-15T09:30:00Z");
    private static final int DPI = 100;
    private static final Signatory FICTIONAL_SIGNATORY = new Signatory("Petr Vzorový", SIGNATORY.role());
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SAMPLE_LOGIC = "A receipt v2 freezes (ThymeleafPdfReceiptRenderer.freeze: data is the frozen JSON) and renders (render, at renderer.issuedAt): "
            + "the PDF's page count and fonts (PDFBox; a subset prefix is dropped), each page's size in points and its text lines (PDFTextStripper per page, "
            + "every line stripped, empty lines dropped, U+00A0 written as a space) with the position of its first character in points from the page's top left, "
            + "rounded to whole points (x, and y at the baseline; TextPosition xDirAdj and yDirAdj). The PDF's and the page rasters' digests depend on the PDF libraries "
            + "and the JDK, so they are kept apart in digests.json";
    private static final Map<String, Rendered> RENDERED = new ConcurrentHashMap<>();
    private static final List<String> HISTORY_SAMPLES = List.of("single-person-cs", "yearly-person-en", "single-company-replacement-cs",
            "yearly-person-many-gifts-cs");

    @TestFactory
    @DisplayName("Given the receipt corpus, when v2 freezes and renders every sample, then data, page count, fonts, page sizes and each line's text and position equal the recorded ones")
    Stream<DynamicTest> should_equal_the_recorded_corpus_when_v2_freezes_and_renders_every_sample() {
        return samples().stream().map(sample -> DynamicTest.dynamicTest(sample.name(),
                () -> GoldenFiles.assertMatches(CORPUS + "/" + sample.name() + ".json", corpusEntry(sample))));
    }

    @Test
    @EnabledIfSystemProperty(named = "golden.files", matches = "write|digests")
    @DisplayName("Given the receipt corpus on the recording machine, when v2 renders every sample, then the PDF digests and the page raster digests equal the recorded ones")
    void should_equal_the_recorded_digests_when_v2_renders_every_sample_on_the_recording_machine() {
        GoldenFiles.assertMatches(DIGESTS, digests());
    }

    @Test
    @DisplayName("Given the corpus folder, when it is listed, then it holds one file per sample, the refusals and the digests, nothing else")
    void should_hold_one_file_per_sample_the_refusals_and_the_digests_when_the_corpus_folder_is_listed() throws IOException {
        TreeSet<String> expected = new TreeSet<>();
        samples().forEach(sample -> expected.add(sample.name() + ".json"));
        expected.add("refusals.json");
        expected.add("digests.json");

        try (Stream<Path> files = Files.list(SharedCases.repositoryRoot().resolve(CORPUS))) {
            assertThat(files.map(file -> file.getFileName().toString()).sorted().toList()).containsExactlyElementsOf(expected);
        }
    }

    @Test
    @DisplayName("Given the four samples of the receipt template history, when the corpus freezes them, then their data equals the recorded history apart from the fictional signatory")
    void should_freeze_the_history_samples_as_recorded_when_the_corpus_freezes_them() throws IOException {
        Map<String, Sample> byName = new LinkedHashMap<>();
        samples().forEach(sample -> byName.put(sample.name(), sample));

        for (String name : HISTORY_SAMPLES) {
            Rendered rendered = rendered(byName.get(name));
            ObjectNode history = (ObjectNode) JSON.readTree(Files.readString(HISTORY.resolve(HISTORY_TEMPLATE).resolve(name + ".data.json"), StandardCharsets.UTF_8));
            history.put("signatoryName", FICTIONAL_SIGNATORY.name());
            String recordedText = Files.readString(HISTORY.resolve(HISTORY_TEMPLATE).resolve(name + ".txt"), StandardCharsets.UTF_8)
                    .replace(SIGNATORY.name(), FICTIONAL_SIGNATORY.name());

            assertThat(JSON.readTree(rendered.snapshot().data())).as(name).isEqualTo(history);
            assertThat(rendered.pages().stream().map(page -> String.join(" ", page.lines().stream().map(Line::text).toList()).replaceAll("\\s+", " ")).toList())
                    .as(name).containsExactlyElementsOf(recordedText.lines().toList());
        }
    }

    @Test
    @DisplayName("Given the template on the classpath, when the corpus is rendered, then it is the template the history recorded")
    void should_render_with_the_recorded_template_when_the_corpus_is_rendered() {
        assertThat(ReceiptTemplate.fromClasspath().digest().value()).isEqualTo(HISTORY_TEMPLATE);
    }

    @Test
    @DisplayName("Given every sample, when it is frozen and rendered twice, then both runs give the same data, the same PDF bytes and the same page rasters")
    void should_give_identical_output_when_every_sample_is_rendered_twice() {
        for (Sample sample : samples()) {
            Rendered first = render(sample);
            Rendered second = render(sample);
            assertThat(GoldenFiles.canonical(corpusEntry(sample, second))).as(sample.name()).isEqualTo(GoldenFiles.canonical(corpusEntry(sample, first)));
            assertThat(GoldenFiles.canonical(digestsOf(sample, second))).as(sample.name()).isEqualTo(GoldenFiles.canonical(digestsOf(sample, first)));
        }
    }

    @Test
    @DisplayName("Given receipts v2 cannot issue, when they are put together, then each is refused as recorded")
    void should_refuse_each_as_recorded_when_receipts_v2_cannot_issue_are_put_together() {
        ArrayNode cases = NODES.arrayNode();
        refusal(cases, "a yearly receipt without a gift", () -> ReceiptDocumentFactory.forYear(jana(), Year.of(2026), List.of(), FOUNDATION,
                FICTIONAL_SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS, Optional.empty()));
        refusal(cases, "a single receipt for a refunded gift", () -> ReceiptDocumentFactory.forDonation(jana(),
                refundedToJana(LocalDate.of(2026, 3, 15), 50000), FOUNDATION, FICTIONAL_SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS, Optional.empty()));
        refusal(cases, "a yearly receipt with a gift from another year", () -> ReceiptDocumentFactory.forYear(jana(), Year.of(2026),
                List.of(receivedFromJana(LocalDate.of(2025, 12, 31), 50000)), FOUNDATION, FICTIONAL_SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS,
                Optional.empty()));
        refusal(cases, "a receipt for another donor's gift", () -> ReceiptDocumentFactory.forDonation(acme(),
                receivedFromJana(LocalDate.of(2026, 3, 15), 50000), FOUNDATION, FICTIONAL_SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS, Optional.empty()));
        ObjectNode file = NODES.objectNode();
        file.put("source", ApiTranscripts.SOURCE);
        file.put("logic", "Receipts that ReceiptDocumentFactory refuses to put together, with the refusal's message (ids written <id>); v2 never renders them. "
                + "The cases have no input: the name says what was attempted, and the documents are built in ReceiptCorpusTest from the receipt fixtures");
        file.set("cases", cases);

        GoldenFiles.assertMatches(REFUSALS, file);
    }

    private static void refusal(ArrayNode cases, String name, Supplier<ReceiptDocument> attempt) {
        ObjectNode entry = cases.addObject();
        entry.put("name", name);
        assertThatThrownBy(attempt::get).as(name).isInstanceOf(IllegalArgumentException.class)
                .satisfies(refused -> entry.putObject("expected").put("refused", refused.getMessage()
                        .replaceAll("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<id>")));
    }

    private static ObjectNode corpusEntry(Sample sample) {
        return corpusEntry(sample, rendered(sample));
    }

    private static ObjectNode corpusEntry(Sample sample, Rendered rendered) {
        ObjectNode entry = NODES.objectNode();
        entry.put("source", ApiTranscripts.SOURCE);
        entry.put("logic", SAMPLE_LOGIC);
        entry.put("sample", sample.name());
        entry.put("description", sample.description());
        ObjectNode renderer = entry.putObject("renderer");
        renderer.put("profile", rendered.snapshot().renderProfile());
        renderer.put("template", rendered.snapshot().template().value());
        renderer.put("number", sample.document().number().value());
        renderer.put("issuedAt", ISSUED_AT.toString());
        renderer.put("signatureImage", sample.signature().isPresent());
        entry.set("data", JSON.readTree(rendered.snapshot().data()));
        ObjectNode pdf = entry.putObject("pdf");
        pdf.put("pageCount", rendered.pages().size());
        ArrayNode fonts = pdf.putArray("fonts");
        rendered.fonts().forEach(fonts::add);
        ArrayNode pages = entry.putArray("pages");
        for (Page page : rendered.pages()) {
            ObjectNode node = pages.addObject();
            node.put("number", page.number());
            node.put("widthPt", page.widthPt());
            node.put("heightPt", page.heightPt());
            ArrayNode lines = node.putArray("lines");
            page.lines().forEach(line -> lines.addObject().put("text", line.text()).put("x", line.x()).put("y", line.y()));
        }
        return entry;
    }

    private static ObjectNode digests() {
        ObjectNode file = NODES.objectNode();
        file.put("source", ApiTranscripts.SOURCE);
        file.put("logic", "The digests of each corpus sample as rendered on the recording machine: the SHA-256 of the PDF's bytes and, per page, of its "
                + "raster (PDFBox PDFRenderer at " + DPI + " DPI, RGB, every pixel as a big-endian int without alpha). They change with the PDF libraries "
                + "and the JDK, so only scripts/record-baseline-data.sh checks them (GOLDEN_FILES=digests); compare page text and the look by eye before "
                + "recording them again. The rendered PDFs and page PNGs are kept beside the screens, in receipts/");
        ArrayNode samples = file.putArray("samples");
        samples().forEach(sample -> samples.add(digestsOf(sample, rendered(sample))));
        return file;
    }

    private static ObjectNode digestsOf(Sample sample, Rendered rendered) {
        ObjectNode node = NODES.objectNode();
        node.put("sample", sample.name());
        node.put("pdfSha256", rendered.sha256());
        ArrayNode pages = node.putArray("pages");
        for (Page page : rendered.pages()) {
            ObjectNode raster = pages.addObject();
            raster.put("number", page.number());
            raster.put("dpi", DPI);
            raster.put("width", page.rasterWidth());
            raster.put("height", page.rasterHeight());
            raster.put("rgbSha256", page.rasterSha256());
        }
        return node;
    }

    private static Rendered rendered(Sample sample) {
        return RENDERED.computeIfAbsent(sample.name(), name -> render(sample));
    }

    private static Rendered render(Sample sample) {
        InMemoryReceiptResources resources = new InMemoryReceiptResources();
        ThymeleafPdfReceiptRenderer renderer = new ThymeleafPdfReceiptRenderer(resources, ReceiptTemplate.fromClasspath(),
                InMemoryReceiptSignatures.holding(sample.signature()), Clock.fixed(NOW, ZoneOffset.UTC));
        ReceiptSnapshot snapshot = renderer.freeze(sample.document());
        byte[] bytes = renderer.render(snapshot, sample.document().number(), ISSUED_AT);
        try (PDDocument document = Loader.loadPDF(bytes)) {
            Files.createDirectories(PREVIEW);
            Files.write(PREVIEW.resolve(sample.name() + ".pdf"), bytes);
            PDFRenderer raster = new PDFRenderer(document);
            List<Page> pages = new ArrayList<>();
            TreeSet<String> fonts = new TreeSet<>();
            for (int index = 0; index < document.getNumberOfPages(); index++) {
                PDPage page = document.getPage(index);
                for (COSName fontName : page.getResources().getFontNames()) {
                    fonts.add(describe(page.getResources().getFont(fontName)));
                }
                BufferedImage image = raster.renderImageWithDPI(index, DPI, ImageType.RGB);
                preview(sample.name(), index + 1, image);
                PDRectangle box = page.getMediaBox();
                pages.add(new Page(index + 1, box.getWidth(), box.getHeight(), lines(document, index + 1), image.getWidth(), image.getHeight(),
                        rasterDigest(image)));
            }
            return new Rendered(snapshot, sha256(bytes), List.copyOf(fonts), pages);
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    private static String describe(PDFont font) {
        String name = font.getName();
        boolean subset = name.length() > 7 && name.charAt(6) == '+';
        return (subset ? name.substring(7) : name) + " (" + font.getSubType() + (font.isEmbedded() ? ", embedded" : ", not embedded")
                + (subset ? ", subset" : "") + ")";
    }

    private static List<Line> lines(PDDocument document, int page) throws IOException {
        LineLayout stripper = new LineLayout();
        stripper.setStartPage(page);
        stripper.setEndPage(page);
        stripper.getText(document);
        return stripper.lines();
    }

    private static String rasterDigest(BufferedImage image) {
        int[] pixels = image.getRGB(0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth());
        ByteBuffer bytes = ByteBuffer.allocate(pixels.length * Integer.BYTES);
        for (int pixel : pixels) {
            bytes.putInt(pixel & 0xFFFFFF);
        }
        return sha256(bytes.array());
    }

    private static void preview(String sample, int page, BufferedImage image) throws IOException {
        ImageIO.write(image, "png", PREVIEW.resolve(sample + "-" + page + ".png").toFile());
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException(missing);
        }
    }

    private static List<Sample> samples() {
        LocalDate march = LocalDate.of(2026, 3, 15);
        LocalDate june = LocalDate.of(2026, 6, 1);
        List<Sample> samples = new ArrayList<>();
        samples.add(new Sample("single-person-cs", "History sample: one gift of a person, Czech",
                single(jana(), receivedFromJana(march, 50000), LocaleCode.CS, Optional.empty()), Optional.empty()));
        samples.add(new Sample("yearly-person-en", "History sample: a person's year with two gifts, English and so bilingual",
                yearly(janaSpeakingEnglish(), Year.of(2026), List.of(receivedFromJana(march, 50000), receivedFromJana(june, 125050)), LocaleCode.EN),
                Optional.empty()));
        samples.add(new Sample("single-company-replacement-cs", "History sample: one gift of a company, replacing an earlier receipt, Czech",
                ReceiptDocumentFactory.forDonation(acme(), receivedFromAcme(LocalDate.of(2026, 5, 5), 1000000), FOUNDATION, FICTIONAL_SIGNATORY,
                        ReceiptNumber.of(Year.of(2027), 2), TODAY, LocaleCode.CS,
                        Optional.of(new ReplacedReceipt(FIRST_NUMBER, LocalDate.of(2027, 1, 10)))), Optional.empty()));
        samples.add(new Sample("yearly-person-many-gifts-cs", "History sample: a person's year with 120 gifts over several pages, Czech",
                yearly(jana(), Year.of(2026), IntStream.range(0, 120)
                        .mapToObj(day -> receivedFromJana(LocalDate.of(2026, 1, 1).plusDays(day * 3L), 10000 + day)).toList(), LocaleCode.CS),
                Optional.empty()));
        samples.add(new Sample("single-company-cs", "One gift of a company with its identifier, no replacement, Czech",
                single(acme(), receivedFromAcme(LocalDate.of(2026, 9, 30), 2500000), LocaleCode.CS, Optional.empty()), Optional.empty()));
        samples.add(new Sample("single-person-en", "One gift of a person who prefers English, so a bilingual single receipt",
                single(janaSpeakingEnglish(), receivedFromJana(LocalDate.of(2026, 11, 2), 125050), LocaleCode.EN, Optional.empty()), Optional.empty()));
        samples.add(new Sample("single-diacritics-cs", "Every Czech letter with a diacritic, lower and upper case, in a long name and address",
                single(diacritics(), donation(JANA, LocalDate.of(2026, 7, 6), 77700, DonationSource.BANK_TRANSFER), LocaleCode.CS, Optional.empty()),
                Optional.empty()));
        samples.add(new Sample("single-foreign-address-cs", "One gift of a person living abroad: the country is written into the city, as v2 has no country field",
                single(abroad(), donation(JANA, LocalDate.of(2026, 4, 20), 30000, DonationSource.BANK_TRANSFER), LocaleCode.CS, Optional.empty()),
                Optional.empty()));
        samples.add(new Sample("single-manual-gift-cs", "One gift recorded by hand, not by bank transfer, Czech",
                single(jana(), donation(JANA, LocalDate.of(2026, 8, 14), 20000, DonationSource.MANUAL), LocaleCode.CS, Optional.empty()),
                Optional.empty()));
        samples.add(new Sample("single-signature-cs", "One gift of a person on a receipt that carries the signature image",
                single(jana(), receivedFromJana(march, 50000), LocaleCode.CS, Optional.empty()), Optional.of(signature())));
        samples.add(new Sample("yearly-one-gift-cs", "A person's year with exactly one gift, Czech",
                yearly(jana(), Year.of(2026), List.of(receivedFromJana(LocalDate.of(2026, 12, 31), 100)), LocaleCode.CS), Optional.empty()));
        samples.add(new Sample("yearly-large-amounts-cs", "A company's year with the largest single amount, hellers and a total over a million, Czech",
                yearly(acme(), Year.of(2026), List.of(receivedFromAcme(LocalDate.of(2026, 1, 1), 100000000), receivedFromAcme(LocalDate.of(2026, 2, 2), 99999999),
                        receivedFromAcme(LocalDate.of(2026, 3, 3), 125050), receivedFromAcme(LocalDate.of(2026, 4, 4), 1)), LocaleCode.CS), Optional.empty()));
        samples.add(new Sample("yearly-40-gifts-cs", "A person's year with 40 gifts, Czech. Three are received on 5 May and given in this order: "
                + "5,000.00 CZK recorded at 12:00, 100.00 CZK recorded at 8:00 with the higher id and 200.00 CZK recorded at 8:00 with the lower id; "
                + "v2 lists gifts by the day received, then the time recorded, then the id",
                yearly(jana(), Year.of(2026), fortyGifts(), LocaleCode.CS), Optional.empty()));
        samples.add(new Sample("yearly-366-gifts-leap-2028-en", "A person's leap year 2028 with one gift on each of its 366 days, English",
                ReceiptDocumentFactory.forYear(janaSpeakingEnglish(), Year.of(2028), IntStream.range(0, 366)
                                .mapToObj(day -> receivedFromJana(LocalDate.of(2028, 1, 1).plusDays(day), 10000 + day * 101L)).toList(), FOUNDATION,
                        FICTIONAL_SIGNATORY, ReceiptNumber.of(Year.of(2029), 8), LocalDate.of(2029, 1, 2), LocaleCode.EN, Optional.empty()),
                Optional.empty()));
        samples.add(new Sample("yearly-leap-year-en", "A person's leap year with gifts on 1 January, 29 February and 31 December, English",
                ReceiptDocumentFactory.forYear(janaSpeakingEnglish(), Year.of(2028), List.of(receivedFromJana(LocalDate.of(2028, 1, 1), 50000),
                                receivedFromJana(LocalDate.of(2028, 2, 29), 29029), receivedFromJana(LocalDate.of(2028, 12, 31), 123456)), FOUNDATION,
                        FICTIONAL_SIGNATORY, ReceiptNumber.of(Year.of(2029), 7), LocalDate.of(2029, 1, 2), LocaleCode.EN, Optional.empty()),
                Optional.empty()));
        return samples;
    }

    private static ReceiptDocument single(DonorRecord record, Donation donation, LocaleCode locale, Optional<ReplacedReceipt> replaces) {
        return ReceiptDocumentFactory.forDonation(record, donation, FOUNDATION, FICTIONAL_SIGNATORY, FIRST_NUMBER, TODAY, locale, replaces);
    }

    private static ReceiptDocument yearly(DonorRecord record, Year year, List<Donation> donations, LocaleCode locale) {
        return ReceiptDocumentFactory.forYear(record, year, donations, FOUNDATION, FICTIONAL_SIGNATORY, FIRST_NUMBER, TODAY, locale, Optional.empty());
    }

    private static List<Donation> fortyGifts() {
        LocalDate fifthOfMay = LocalDate.of(2026, 5, 5);
        List<Donation> gifts = new ArrayList<>();
        gifts.add(recorded(fifthOfMay, 500000, "2026-05-05T12:00:00Z", 3));
        gifts.add(recorded(fifthOfMay, 10000, "2026-05-05T08:00:00Z", 2));
        gifts.add(recorded(fifthOfMay, 20000, "2026-05-05T08:00:00Z", 1));
        IntStream.range(0, 37).mapToObj(index -> receivedFromJana(LocalDate.of(2026, 1, 3).plusDays(index * 9L), 10000 + index * 250L)).forEach(gifts::add);
        return gifts;
    }

    private static Donation recorded(LocalDate receivedOn, long amountMinor, String recordedAt, long id) {
        return Donation.reconstitute(new DonationId(new UUID(0x0190a000_0000_7000L, 0x8000_0000_0000_0000L + id)), JANA,
                Optional.of(BankPaymentId.newId(NOW)), receivedOn, Money.czk(amountMinor), DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED,
                Optional.of(PairingMethod.VARIABLE_SYMBOL), Instant.parse(recordedAt));
    }

    private static DonorRecord diacritics() {
        return DonorRecord.registerPerson(JANA, "Řehoř Ďáblík-Šťastný Žluťoučký z Čížkova a Ňůšková-Ťapková, rozená Úlehlová-Ěrová",
                new PostalAddress("Úvozní 1287/15a, Pod Šibeničním vrchem, áčďéěíňóřšťúůýž", "Ústí nad Orlicí – Hylváty, ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ", "562 01"),
                new VariableSymbol("6203917452"), LocaleCode.CS, NOW);
    }

    private static DonorRecord abroad() {
        return DonorRecord.registerPerson(JANA, "Lena Beispielová", new PostalAddress("Hauptstraße 7", "Dresden, Německo", "01067"),
                new VariableSymbol("6203917452"), LocaleCode.CS, NOW);
    }

    private static Donation donation(DonorReference donor, LocalDate receivedOn, long amountMinor, DonationSource source) {
        boolean bank = source == DonationSource.BANK_TRANSFER;
        return Donation.reconstitute(DonationId.newId(NOW), donor, bank ? Optional.of(BankPaymentId.newId(NOW)) : Optional.empty(), receivedOn,
                Money.czk(amountMinor), source, DonationStatus.RECEIVED, bank ? Optional.of(PairingMethod.VARIABLE_SYMBOL) : Optional.empty(), NOW);
    }

    private static SignatureImage signature() {
        BufferedImage image = new BufferedImage(600, 200, BufferedImage.TYPE_INT_ARGB);
        Graphics2D pen = image.createGraphics();
        pen.setColor(new Color(0x1F, 0x2A, 0x44));
        pen.setStroke(new BasicStroke(6));
        pen.drawPolyline(new int[]{40, 120, 160, 230, 300, 360, 430, 560}, new int[]{150, 50, 140, 60, 150, 70, 130, 90}, 8);
        pen.dispose();
        try {
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            ImageIO.write(image, "png", png);
            return new SignatureImage(png.toByteArray(), image.getWidth(), image.getHeight());
        } catch (IOException unwritable) {
            throw new UncheckedIOException(unwritable);
        }
    }

    private record Sample(String name, String description, ReceiptDocument document, Optional<SignatureImage> signature) {
    }

    private record Rendered(ReceiptSnapshot snapshot, String sha256, List<String> fonts, List<Page> pages) {
    }

    private record Line(String text, int x, int y) {
    }

    private static final class LineLayout extends PDFTextStripper {

        private final List<Line> lines = new ArrayList<>();
        private final StringBuilder text = new StringBuilder();
        private Optional<TextPosition> first = Optional.empty();

        @Override
        protected void writeString(String chunk, List<TextPosition> positions) throws IOException {
            if (first.isEmpty() && !positions.isEmpty()) {
                first = Optional.of(positions.getFirst());
            }
            text.append(chunk);
            super.writeString(chunk, positions);
        }

        @Override
        protected void writeWordSeparator() throws IOException {
            text.append(' ');
            super.writeWordSeparator();
        }

        @Override
        protected void writeLineSeparator() throws IOException {
            endLine();
            super.writeLineSeparator();
        }

        @Override
        protected void writePageEnd() throws IOException {
            endLine();
            super.writePageEnd();
        }

        private void endLine() {
            String line = text.toString().replace('\u00a0', ' ').strip();
            first.filter(position -> !line.isEmpty())
                    .ifPresent(position -> lines.add(new Line(line, Math.round(position.getXDirAdj()), Math.round(position.getYDirAdj()))));
            text.setLength(0);
            first = Optional.empty();
        }

        List<Line> lines() {
            return List.copyOf(lines);
        }
    }

    private record Page(int number, float widthPt, float heightPt, List<Line> lines, int rasterWidth, int rasterHeight, String rasterSha256) {
    }
}
