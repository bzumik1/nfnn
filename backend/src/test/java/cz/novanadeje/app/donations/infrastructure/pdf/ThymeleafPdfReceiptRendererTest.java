package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import cz.novanadeje.app.donations.domain.receipt.ReceiptTextSet;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.SignatureArtwork;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.SignaturePath;
import cz.novanadeje.app.donations.domain.receipt.SignaturePathData;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureViewBox;
import cz.novanadeje.app.donations.infrastructure.texts.BundleReceiptTextSource;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.function.Consumer;
import java.util.stream.IntStream;
import java.util.stream.StreamSupport;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.FOUNDATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SIGNATORY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.acme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.janaSpeakingEnglish;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromAcme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.verificationOf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ThymeleafPdfReceiptRendererTest {

    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final Donation JUNE = receivedFromJana(LocalDate.of(2026, 6, 1), 125050);

    private static final BundleReceiptTextSource TEXTS = new BundleReceiptTextSource();
    private static final Optional<SignatureImage> SIGNED = Optional.of(signature(300, 100));

    private final InMemoryReceiptResources resources = new InMemoryReceiptResources();

    @Test
    @DisplayName("Given a Czech single receipt of a person, when rendered, then every part of the receipt is in the PDF text with its Czech letters")
    void should_print_every_part_with_czech_letters_when_rendered_given_czech_single_receipt() {
        render(Receipts.singleDocument(jana(), MARCH), pdf -> assertThat(text(pdf))
                .contains("Potvrzení o přijetí daru")
                .contains("Číslo potvrzení: 2027-000001")
                .contains("Datum vystavení: 15. 1. 2027")
                .contains("Obdarovaný")
                .contains("Název: Nová naděje - nadační fond")
                .contains("IČO: 27278794")
                .contains("Sídlo: Jiráskova 436, 473 01 Nový Bor")
                .contains("zapsaný v nadačním rejstříku, spisová značka N 78, rejstříkový soud: Krajský soud v Ústí nad Labem")
                .contains("Dárce")
                .contains("Jméno a příjmení: Jana Nováková")
                .contains("Bydliště: Dlouhá 12, 400 01 Ústí nad Labem")
                .contains("Variabilní symbol: 4821937560")
                .contains("Forma daru: peněžitý dar, bankovní převod")
                .contains("Datum připsání na účet: 15. 3. 2026")
                .contains("Částka: 500 Kč")
                .contains("Účet příjemce: 5544332217/2010")
                .contains("Nová naděje - nadační fond potvrzuje, že od výše uvedeného dárce přijal dne 15. 3. 2026 peněžitý dar ve výši 500 Kč,"
                        + " poukázaný bankovním převodem na účet nadačního fondu č. 5544332217/2010.")
                .contains("§ 15 odst. 1 a § 20 odst. 8 zákona č. 586/1992 Sb., o daních z příjmů")
                .contains("V Novém Boru, dne 15. 1. 2027")
                .contains("Za Nová naděje - nadační fond:")
                .contains("Pavel Znamenáček")
                .contains("předseda správní rady")
                .contains("Nová naděje - nadační fond · IČO 27278794 · Jiráskova 436, 473 01 Nový Bor · Číslo potvrzení: 2027-000001")
                .doesNotContain("Confirmation", "??", "daňově odečitatelný"));
    }

    @Test
    @DisplayName("Given a receipt, when rendered, then the PDF carries the receipt title, the foundation as author and the producer")
    void should_set_title_author_and_producer_when_rendered_given_receipt() {
        render(Receipts.singleDocument(jana(), MARCH), pdf -> {
            PDDocumentInformation information = information(pdf);
            assertThat(information.getTitle()).isEqualTo("Potvrzení o přijetí daru");
            assertThat(information.getAuthor()).isEqualTo("Nová naděje - nadační fond");
            assertThat(information.getProducer()).isEqualTo("Nová naděje - nadační fond");
        });
    }

    @Test
    @DisplayName("Given an English yearly receipt, when rendered, then it is bilingual with the Czech text and the English beneath")
    void should_be_bilingual_when_rendered_given_english_yearly_receipt() {
        render(Receipts.yearlyDocument(janaSpeakingEnglish(), List.of(MARCH, JUNE)), pdf -> assertThat(text(pdf))
                .contains("Potvrzení o přijatých darech za rok 2026")
                .contains("Confirmation of donations received in 2026")
                .contains("Dárce")
                .contains("Donor")
                .contains("Počet darů: 2")
                .contains("Number of gifts: 2")
                .contains("Celkem darováno v roce 2026: 1 750,50 Kč")
                .contains("Total donated in 2026: CZK 1,750.50")
                .contains("15 March 2026")
                .contains("§ 15 odst. 1 and § 20 odst. 8 of zákon č. 586/1992 Sb., o daních z příjmů (Section 15(1) and Section 20(8) of Act No. 586/1992 Coll., on Income Taxes)")
                .contains("In Nový Bor, on 15 January 2027")
                .doesNotContain("??"));
    }

    @Test
    @DisplayName("Given a Czech yearly receipt, when rendered, then it lists the gifts with count and total and stays Czech only")
    void should_list_gifts_when_rendered_given_czech_yearly_receipt() {
        render(Receipts.yearlyDocument(jana(), List.of(JUNE, MARCH)), pdf -> assertThat(text(pdf))
                .contains("Potvrzení o přijatých darech za rok 2026")
                .contains("Účet příjemce: 5544332217/2010")
                .contains("Datum připsání na účet Částka")
                .containsSubsequence("15. 3. 2026 500 Kč", "1. 6. 2026 1 250,50 Kč")
                .contains("Počet darů: 2")
                .contains("Celkem darováno v roce 2026: 1 750,50 Kč")
                .contains("přijal v roce 2026 peněžité dary uvedené v tomto potvrzení v celkové výši 1 750,50 Kč")
                .doesNotContain("Confirmation", "??"));
    }

    @Test
    @DisplayName("Given a company's receipt, when rendered, then the donor is printed with name, company identifier and seat")
    void should_print_company_labels_when_rendered_given_company_donor() {
        ReceiptDocument document = ReceiptDocumentFactory.forDonation(acme(), receivedFromAcme(LocalDate.of(2026, 5, 5), 1000000), FOUNDATION,
                SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS, Optional.empty());

        render(document, pdf -> assertThat(text(pdf))
                .contains("Název: Acme Třebíč s.r.o.")
                .contains("IČO: 25596641")
                .contains("Sídlo: Průmyslová 5, 470 01 Česká Lípa")
                .contains("Částka: 10 000 Kč")
                .doesNotContain("Jméno a příjmení", "Bydliště"));
    }

    @Test
    @DisplayName("Given a replacement, when rendered, then the receipt states which receipt it replaces in both languages")
    void should_state_replaced_receipt_when_rendered_given_replacement() {
        ReceiptDocument document = ReceiptDocumentFactory.forYear(janaSpeakingEnglish(), YEAR_2026, List.of(MARCH), FOUNDATION, SIGNATORY,
                ReceiptNumber.of(Year.of(2027), 2), TODAY, LocaleCode.EN, Optional.of(new ReplacedReceipt(FIRST_NUMBER, LocalDate.of(2027, 1, 10))));

        render(document, pdf -> assertThat(text(pdf))
                .contains("Toto potvrzení nahrazuje potvrzení č. 2027-000001 ze dne 10. 1. 2027, které tímto pozbývá platnosti.")
                .contains("This confirmation replaces confirmation No. 2027-000001 of 10 January 2027, which is hereby void.")
                .contains("Číslo potvrzení: 2027-000002"));
    }

    @Test
    @DisplayName("Given a yearly receipt of 400 gifts, when rendered, then it runs over several pages and the last page repeats the number and the column titles")
    void should_repeat_number_and_header_on_last_page_when_rendered_given_400_gifts() {
        List<Donation> gifts = IntStream.range(0, 400)
                .mapToObj(day -> receivedFromJana(LocalDate.of(2026, 1, 1).plusDays(day % 365), 10000 + day))
                .toList();

        render(Receipts.yearlyDocument(jana(), gifts), pdf -> {
            try (PDDocument document = Loader.loadPDF(pdf)) {
                assertThat(document.getNumberOfPages()).isGreaterThan(1);
                PDFTextStripper lastPage = new PDFTextStripper();
                lastPage.setStartPage(document.getNumberOfPages());
                lastPage.setEndPage(document.getNumberOfPages());
                assertThat(normalized(lastPage.getText(document)))
                        .contains("Číslo potvrzení: 2027-000001")
                        .contains("Datum připsání na účet Částka")
                        .contains("Nová naděje - nadační fond potvrzuje, že od výše uvedeného dárce přijal v roce 2026")
                        .contains("Pavel Znamenáček")
                        .contains(document.getNumberOfPages() + " / " + document.getNumberOfPages());
            } catch (IOException e) {
                throw new AssertionError(e);
            }
        });
    }

    @Test
    @DisplayName("Given a configured PNG signature, when a receipt is rendered, then it renders without error and still names the signatory")
    void should_render_with_signature_when_rendered_given_png_signature() {
        byte[] pdf = issue(SIGNED, Receipts.singleDocument(jana(), MARCH));

        assertThat(text(pdf)).contains("Pavel Znamenáček");
        assertThat(imagesOnFirstPage(pdf)).as("logo and signature").isEqualTo(2);
        render(Receipts.singleDocument(jana(), MARCH), unsignedPdf -> assertThat(imagesOnFirstPage(unsignedPdf)).as("logo only").isEqualTo(1));
    }

    @Test
    @DisplayName("Given a current signature that cannot be read as a scan, when a receipt is frozen, then only the current scan is asked for and the receipt carries no signature")
    void should_ask_only_for_current_scan_when_frozen_given_signature_that_is_no_scan() {
        ReceiptSignatureRepository signatures = mock(ReceiptSignatureRepository.class);
        when(signatures.current()).thenThrow(new IllegalStateException("The stored signature vector cannot be read"));
        when(signatures.currentScan()).thenReturn(Optional.empty());
        ThymeleafPdfReceiptRenderer renderer = new ThymeleafPdfReceiptRenderer(resources, ReceiptTemplate.fromClasspath(), signatures,
                Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(renderer.freeze(Receipts.singleDocument(jana(), MARCH)).signature()).isEmpty();
        verify(signatures, never()).current();
    }

    @Test
    @DisplayName("Given a yearly receipt, when rendered, then its title stays on one line with the year")
    void should_keep_title_on_one_line_when_rendered_given_yearly_receipt() {
        render(Receipts.yearlyDocument(jana(), List.of(MARCH, JUNE)), pdf -> assertThat(lines(pdf))
                .anyMatch(line -> line.contains("Potvrzení o přijatých darech za rok 2026")));
        render(Receipts.yearlyDocument(janaSpeakingEnglish(), List.of(MARCH, JUNE)), pdf -> assertThat(lines(pdf))
                .anyMatch(line -> line.contains("Confirmation of donations received in 2026")));
    }

    @Test
    @DisplayName("Given a bilingual yearly receipt of two gifts without a signature image, when rendered, then it fits on one page")
    void should_fit_on_one_page_when_rendered_given_bilingual_yearly_receipt_of_two_gifts() {
        render(Receipts.yearlyDocument(janaSpeakingEnglish(), List.of(MARCH, JUNE)), pdf -> assertThat(pages(pdf)).isEqualTo(1));
    }

    @Test
    @DisplayName("Given a bilingual single receipt with a signature image, when rendered, then it fits on one page")
    void should_fit_on_one_page_when_rendered_given_bilingual_single_receipt_with_signature() {
        byte[] pdf = issue(SIGNED, Receipts.singleDocument(janaSpeakingEnglish(), MARCH));

        assertThat(pages(pdf)).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a bilingual yearly receipt too long for one page, when rendered, then the declaration moves to the last page with the signature")
    void should_keep_declaration_with_signature_when_rendered_given_bilingual_yearly_receipt_over_one_page() {
        List<Donation> gifts = IntStream.rangeClosed(1, 6).mapToObj(month -> receivedFromJana(LocalDate.of(2026, month, 1), 10000)).toList();

        byte[] pdf = issue(SIGNED, Receipts.yearlyDocument(janaSpeakingEnglish(), gifts));

        assertThat(pages(pdf)).isEqualTo(2);
        assertThat(pageText(pdf, 1)).doesNotContain("potvrzuje, že");
        assertThat(pageText(pdf, 2))
                .contains("Nová naděje - nadační fond potvrzuje, že od výše uvedeného dárce přijal v roce 2026")
                .contains("Pavel Znamenáček");
    }

    @Test
    @DisplayName("Given a frozen receipt, when rendered, then the PDF prints the frozen texts, not the texts the bundle has today")
    void should_print_frozen_texts_when_rendered_given_texts_changed_since_issue() {
        ReceiptDocument document = Receipts.singleDocument(jana(), MARCH);
        SortedMap<String, String> czech = new TreeMap<>(TEXTS.textsFor(LocaleCode.CS).czech());
        czech.put("receipt.title.single", "Potvrzení o daru, jak znělo při vystavení");
        FrozenReceipt frozen = new FrozenReceipt(document, ReceiptTextSet.czechOnly(czech), Optional.empty(), verificationOf(document.number()));

        assertThat(text(renderer().render(frozen, NOW)))
                .contains("Potvrzení o daru, jak znělo při vystavení")
                .doesNotContain("Potvrzení o přijetí daru");
    }

    @Test
    @DisplayName("Given a document, when its frozen receipt is rendered, then the text equals what the receipt-snapshot path renders for the same document")
    void should_render_same_text_as_snapshot_path_when_rendered_given_same_document() {
        for (ReceiptDocument document : List.of(Receipts.singleDocument(jana(), MARCH), Receipts.yearlyDocument(janaSpeakingEnglish(), List.of(MARCH, JUNE)))) {
            ThymeleafPdfReceiptRenderer renderer = renderer();
            byte[] snapshotPdf = renderer.render(renderer.freeze(document), document.number(), NOW);

            assertThat(text(issue(Optional.empty(), document))).isEqualTo(text(snapshotPdf));
        }
    }

    @Test
    @DisplayName("Given a frozen receipt naming a signature image that is not stored, when rendered, then rendering fails instead of leaving the signature out")
    void should_fail_when_rendered_given_unknown_signature_image() {
        ReceiptDocument document = Receipts.singleDocument(jana(), MARCH);
        FrozenReceipt frozen = new FrozenReceipt(document, TEXTS.textsFor(LocaleCode.CS), Optional.of(new ContentDigest("f".repeat(64))),
                verificationOf(document.number()));

        assertThatThrownBy(() -> renderer().render(frozen, NOW))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("is not stored");
    }

    private ThymeleafPdfReceiptRenderer renderer() {
        return new ThymeleafPdfReceiptRenderer(resources, ReceiptTemplate.fromClasspath(), InMemoryReceiptSignatures.holding(Optional.empty()),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private ThymeleafPdfReceiptRenderer renderer(ReceiptTemplate template, Optional<? extends SignatureArtwork> signature) {
        return new ThymeleafPdfReceiptRenderer(resources, template, InMemoryReceiptSignatures.holding(signature), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    static SignatureImage signature(int width, int height) {
        try {
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB), "png", png);
            return new SignatureImage(png.toByteArray(), width, height);
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }

    private byte[] issue(Optional<SignatureImage> signature, ReceiptDocument document) {
        signature.ifPresent(image -> resources.storeImage(image.digest(), new ReceiptImage(image.png(), "image/png"), NOW));
        FrozenReceipt frozen = new FrozenReceipt(document, TEXTS.textsFor(document.locale()), signature.map(SignatureImage::digest),
                verificationOf(document.number()));
        byte[] pdf = renderer().render(frozen, NOW);
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        return pdf;
    }

    private void render(ReceiptDocument document, Consumer<byte[]> assertions) {
        assertions.accept(issue(Optional.empty(), document));
    }

    private static String text(byte[] pdf) {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return normalized(new PDFTextStripper().getText(document));
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }

    private static PDDocumentInformation information(byte[] pdf) {
        return read(pdf, PDDocument::getDocumentInformation);
    }

    private static List<String> lines(byte[] pdf) {
        return read(pdf, document -> new PDFTextStripper().getText(document).replace('\u00a0', ' ').lines().toList());
    }

    private static int pages(byte[] pdf) {
        return read(pdf, PDDocument::getNumberOfPages);
    }

    private static String pageText(byte[] pdf, int page) {
        return read(pdf, document -> {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(page);
            stripper.setEndPage(page);
            return normalized(stripper.getText(document));
        });
    }

    private static long imagesOnFirstPage(byte[] pdf) {
        return read(pdf, document -> {
            PDPage page = document.getPage(0);
            PDResources resources = page.getResources();
            return StreamSupport.stream(resources.getXObjectNames().spliterator(), false)
                    .filter(name -> {
                        try {
                            PDXObject object = resources.getXObject(name);
                            return object instanceof PDImageXObject;
                        } catch (IOException e) {
                            throw new AssertionError(e);
                        }
                    })
                    .count();
        });
    }

    private interface PdfReader<T> {
        T read(PDDocument document) throws IOException;
    }

    private static <T> T read(byte[] pdf, PdfReader<T> reader) {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return reader.read(document);
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }

    private static String normalized(String text) {
        return text.replace(' ', ' ').replaceAll("\\s+", " ");
    }
}
