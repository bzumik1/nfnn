package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.application.receipt.DonationReceiptRenderer;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.MessageSourceAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.thymeleaf.autoconfigure.ThymeleafAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.stream.IntStream;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.FOUNDATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SIGNATORY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.acme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.janaSpeakingEnglish;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromAcme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static org.assertj.core.api.Assertions.assertThat;

class ThymeleafPdfReceiptRendererTest {

    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final Donation JUNE = receivedFromJana(LocalDate.of(2026, 6, 1), 125050);

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MessageSourceAutoConfiguration.class, ThymeleafAutoConfiguration.class))
            .withUserConfiguration(ThymeleafPdfReceiptRenderer.class);

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
                        .contains(document.getNumberOfPages() + " / " + document.getNumberOfPages());
            } catch (IOException e) {
                throw new AssertionError(e);
            }
        });
    }

    @Test
    @DisplayName("Given a configured PNG signature, when a receipt is rendered, then it renders without error and still names the signatory")
    void should_render_with_signature_when_rendered_given_png_signature() throws IOException {
        byte[] png = new ClassPathResource("receipt/logo.png").getContentAsByteArray();
        ApplicationContextRunner withSignature = contexts.withBean(ConfiguredSignatureImage.class,
                () -> new ConfiguredSignatureImage(Optional.of(new SignatureImage(png, "image/png"))));

        withSignature.run(context -> {
            byte[] pdf = context.getBean(DonationReceiptRenderer.class).render(Receipts.singleDocument(jana(), MARCH));
            assertThat(text(pdf)).contains("Pavel Znamenáček");
        });
    }

    private void render(ReceiptDocument document, Consumer<byte[]> assertions) {
        contexts.withUserConfiguration(NoSignature.class).run(context -> {
            assertThat(context).hasNotFailed();
            byte[] pdf = context.getBean(DonationReceiptRenderer.class).render(document);
            assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
            assertions.accept(pdf);
        });
    }

    private static String text(byte[] pdf) {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return normalized(new PDFTextStripper().getText(document));
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }

    private static PDDocumentInformation information(byte[] pdf) {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return document.getDocumentInformation();
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }

    private static String normalized(String text) {
        return text.replace(' ', ' ').replaceAll("\\s+", " ");
    }

    @Configuration(proxyBeanMethods = false)
    static class NoSignature {

        @Bean
        ConfiguredSignatureImage configuredSignatureImage() {
            return new ConfiguredSignatureImage(Optional.empty());
        }
    }
}
