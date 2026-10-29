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
import cz.novanadeje.app.regression.Baseline;
import cz.novanadeje.app.regression.GoldenFiles;
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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
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
    private static final Path HISTORY = Path.of("src/test/resources/receipts/history");
    private static final Path PREVIEW = Path.of("build/receipt-corpus");
    private static final String HISTORY_TEMPLATE = "7b30974aef2fdaf01f6e4990c8c4b526a0de8d8371452023be783677b69bf7e7";
    private static final Instant ISSUED_AT = Instant.parse("2027-01-15T09:30:00Z");
    private static final int DPI = 100;
    private static final Signatory FICTIONAL_SIGNATORY = new Signatory("Petr Vzorový", SIGNATORY.role());
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final List<String> HISTORY_SAMPLES = List.of("single-person-cs", "yearly-person-en", "single-company-replacement-cs",
            "yearly-person-many-gifts-cs");

    @TestFactory
    @DisplayName("Given the receipt corpus, when v2 freezes and renders every sample, then data, page text, page count, fonts and page rasters equal the recorded ones")
    Stream<DynamicTest> should_equal_the_recorded_corpus_when_v2_freezes_and_renders_every_sample() {
        return samples().stream().map(sample -> DynamicTest.dynamicTest(sample.name(),
                () -> GoldenFiles.assertMatches(CORPUS + "/" + sample.name() + ".json", corpusEntry(sample))));
    }

    @Test
    @DisplayName("Given the corpus folder, when it is listed, then it holds one file per sample and the refusals, nothing else")
    void should_hold_one_file_per_sample_and_the_refusals_when_the_corpus_folder_is_listed() throws IOException {
        TreeSet<String> expected = new TreeSet<>();
        samples().forEach(sample -> expected.add(sample.name() + ".json"));
        expected.add("refusals.json");

        try (Stream<Path> files = Files.list(GoldenFiles.repositoryRoot().resolve(CORPUS))) {
            assertThat(files.map(file -> file.getFileName().toString()).sorted().toList()).containsExactlyElementsOf(expected);
        }
    }

    @Test
    @DisplayName("Given the four samples of the receipt template history, when the corpus freezes them, then their data equals the recorded history apart from the fictional signatory")
    void should_freeze_the_history_samples_as_recorded_when_the_corpus_freezes_them() throws IOException {
        Map<String, Sample> byName = new LinkedHashMap<>();
        samples().forEach(sample -> byName.put(sample.name(), sample));

        for (String name : HISTORY_SAMPLES) {
            Rendered rendered = render(byName.get(name));
            ObjectNode history = (ObjectNode) JSON.readTree(Files.readString(HISTORY.resolve(HISTORY_TEMPLATE).resolve(name + ".data.json"), StandardCharsets.UTF_8));
            history.put("signatoryName", FICTIONAL_SIGNATORY.name());
            String recordedText = Files.readString(HISTORY.resolve(HISTORY_TEMPLATE).resolve(name + ".txt"), StandardCharsets.UTF_8)
                    .replace(SIGNATORY.name(), FICTIONAL_SIGNATORY.name());

            assertThat(JSON.readTree(rendered.snapshot().data())).as(name).isEqualTo(history);
            assertThat(rendered.pages().stream().map(page -> String.join(" ", page.lines()).replaceAll("\\s+", " ")).toList())
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
            assertThat(GoldenFiles.canonical(corpusEntry(sample))).as(sample.name()).isEqualTo(GoldenFiles.canonical(corpusEntry(sample)));
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
        file.put("source", Baseline.SOURCE);
        file.put("logic", "Receipts that ReceiptDocumentFactory refuses to put together, with the refusal's message; v2 never renders them");
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
        Rendered rendered = render(sample);
        ObjectNode entry = NODES.objectNode();
        entry.put("source", Baseline.SOURCE);
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
        pdf.put("sha256", rendered.sha256());
        pdf.put("pageCount", rendered.pages().size());
        ArrayNode fonts = pdf.putArray("fonts");
        rendered.fonts().forEach(fonts::add);
        ArrayNode pages = entry.putArray("pages");
        for (Page page : rendered.pages()) {
            ObjectNode node = pages.addObject();
            node.put("number", page.number());
            node.put("widthPt", page.widthPt());
            node.put("heightPt", page.heightPt());
            ObjectNode raster = node.putObject("raster");
            raster.put("dpi", DPI);
            raster.put("width", page.rasterWidth());
            raster.put("height", page.rasterHeight());
            raster.put("rgbSha256", page.rasterSha256());
            ArrayNode lines = node.putArray("lines");
            page.lines().forEach(lines::add);
        }
        return entry;
    }

    private static Rendered render(Sample sample) {
        InMemoryReceiptResources resources = new InMemoryReceiptResources();
        ThymeleafPdfReceiptRenderer renderer = new ThymeleafPdfReceiptRenderer(resources, ReceiptTemplate.fromClasspath(),
                InMemoryReceiptSignatures.holding(sample.signature()), Clock.fixed(NOW, ZoneOffset.UTC));
        ReceiptSnapshot snapshot = renderer.freeze(sample.document());
        byte[] bytes = renderer.render(snapshot, sample.document().number(), ISSUED_AT);
        try (PDDocument document = Loader.loadPDF(bytes)) {
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

    private static List<String> lines(PDDocument document, int page) throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(page);
        stripper.setEndPage(page);
        return stripper.getText(document).lines().map(line -> line.replace(' ', ' ').strip()).filter(line -> !line.isEmpty()).toList();
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
        Files.createDirectories(PREVIEW);
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

    private record Page(int number, float widthPt, float heightPt, List<String> lines, int rasterWidth, int rasterHeight, String rasterSha256) {
    }
}
