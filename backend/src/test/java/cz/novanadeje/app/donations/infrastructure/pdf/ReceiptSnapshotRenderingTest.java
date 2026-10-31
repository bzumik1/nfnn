package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSnapshot;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeMap;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class ReceiptSnapshotRenderingTest {

    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final ReceiptDocument SINGLE = Receipts.singleDocument(jana(), MARCH);

    private final InMemoryReceiptResources resources = new InMemoryReceiptResources();
    private final ReceiptTemplate current = ReceiptTemplate.fromClasspath();

    @Test
    @DisplayName("Given a signed receipt, when it is frozen, then the template, logo and signature are stored once and the data holds no image")
    void should_store_template_and_images_and_keep_data_free_of_images_when_frozen_given_signed_receipt() {
        SignatureImage signature = ThymeleafPdfReceiptRendererTest.signature(300, 100);
        ThymeleafPdfReceiptRenderer renderer = renderer(current, Optional.of(signature));

        ReceiptSnapshot first = renderer.freeze(SINGLE);
        ReceiptSnapshot second = renderer.freeze(Receipts.singleDocument(jana(), receivedFromJana(LocalDate.of(2026, 4, 1), 20000)));

        assertThat(first.template()).isEqualTo(current.digest()).isEqualTo(second.template());
        assertThat(first.signature()).contains(signature.digest());
        assertThat(first.renderProfile()).isEqualTo(1);
        assertThat(resources.template(first.template())).contains(current.content());
        assertThat(resources.image(first.logo())).isPresent();
        assertThat(resources.image(signature.digest())).isPresent();
        assertThat(resources.templateCount()).isEqualTo(1);
        assertThat(resources.imageCount()).isEqualTo(2);
        assertThat(first.data())
                .contains("\"totalCs\":\"500 Kč\"", "\"receivedOnCs\":\"15. 3. 2026\"", "\"donorName\":\"Jana Nováková\"")
                .doesNotContain("data:", "base64", "receipt.title", "\"cs\":", "\"logo\":", "\"signature\":");
    }

    @Test
    @DisplayName("Given a frozen receipt, when it is rendered twice at different moments, then both PDFs are byte for byte the same and dated at the issue")
    void should_render_same_bytes_dated_at_issue_when_rendered_twice_given_snapshot() throws Exception {
        ThymeleafPdfReceiptRenderer renderer = renderer(current, Optional.empty());
        ReceiptSnapshot snapshot = renderer.freeze(SINGLE);
        Instant issuedAt = Instant.parse("2027-01-15T09:30:00Z");

        byte[] first = renderer.render(snapshot, FIRST_NUMBER, issuedAt);
        Thread.sleep(1100);
        byte[] second = renderer(current, Optional.empty()).render(snapshot, FIRST_NUMBER, issuedAt);

        assertThat(second).isEqualTo(first);
        try (PDDocument document = Loader.loadPDF(first)) {
            assertThat(document.getDocumentInformation().getCreationDate().toInstant()).isEqualTo(issuedAt);
        }
    }

    @Test
    @DisplayName("Given a receipt frozen with an earlier template, when the template and its texts change, then the receipt still renders its original wording")
    void should_keep_original_wording_when_rendered_given_template_changed_after_freeze() {
        ReceiptSnapshot issuedEarlier = renderer(current, Optional.empty()).freeze(SINGLE);
        TreeMap<String, String> changedTexts = new TreeMap<>(current.czech());
        changedTexts.put("receipt.donee", "Příjemce daru");
        ReceiptTemplate changed = new ReceiptTemplate(current.html().replace("<body>", "<body><p>Nová hlavička</p>"), changedTexts,
                current.english());
        ThymeleafPdfReceiptRenderer afterChange = renderer(changed, Optional.empty());

        String original = text(afterChange.render(issuedEarlier, FIRST_NUMBER, NOW));
        ReceiptSnapshot issuedLater = afterChange.freeze(SINGLE);
        String updated = text(afterChange.render(issuedLater, FIRST_NUMBER, NOW));

        assertThat(original).contains("Obdarovaný").doesNotContain("Příjemce daru", "Nová hlavička");
        assertThat(updated).contains("Příjemce daru", "Nová hlavička").doesNotContain("Obdarovaný");
        assertThat(issuedLater.template()).isNotEqualTo(issuedEarlier.template());
        assertThat(resources.templateCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given a signed receipt, when an administrator uploads another signature, then the receipt keeps the earlier one and the next receipt carries the new one")
    void should_keep_earlier_signature_and_freeze_new_one_when_rendered_given_signature_replaced_after_freeze() {
        InMemoryReceiptSignatures signatures = InMemoryReceiptSignatures.holding(Optional.of(ThymeleafPdfReceiptRendererTest.signature(300, 100)));
        ThymeleafPdfReceiptRenderer renderer = new ThymeleafPdfReceiptRenderer(resources, current, signatures, Clock.fixed(NOW, ZoneOffset.UTC));
        ReceiptSnapshot issuedEarlier = renderer.freeze(SINGLE);

        signatures.replace(InMemoryReceiptSignatures.SIGNATORY, ThymeleafPdfReceiptRendererTest.signature(200, 50), NOW);

        assertThat(imageWidths(renderer.render(issuedEarlier, FIRST_NUMBER, NOW))).contains(300).doesNotContain(200);
        assertThat(imageWidths(renderer.render(renderer.freeze(SINGLE), FIRST_NUMBER, NOW))).contains(200).doesNotContain(300);
    }

    @Test
    @DisplayName("Given a signed receipt, when an administrator removes the signature, then the receipt keeps it and the next receipt has none")
    void should_freeze_no_signature_when_frozen_given_signature_removed() {
        InMemoryReceiptSignatures signatures = InMemoryReceiptSignatures.holding(Optional.of(ThymeleafPdfReceiptRendererTest.signature(300, 100)));
        ThymeleafPdfReceiptRenderer renderer = new ThymeleafPdfReceiptRenderer(resources, current, signatures, Clock.fixed(NOW, ZoneOffset.UTC));
        ReceiptSnapshot issuedEarlier = renderer.freeze(SINGLE);

        signatures.remove(InMemoryReceiptSignatures.SIGNATORY);
        ReceiptSnapshot issuedLater = renderer.freeze(SINGLE);

        assertThat(issuedEarlier.signature()).isPresent();
        assertThat(issuedLater.signature()).isEmpty();
        assertThat(imageWidths(renderer.render(issuedEarlier, FIRST_NUMBER, NOW))).contains(300);
        assertThat(imageWidths(renderer.render(issuedLater, FIRST_NUMBER, NOW))).doesNotContain(300);
    }

    @Test
    @DisplayName("Given a snapshot whose template is not stored, when it is rendered, then it is refused")
    void should_refuse_when_rendered_given_unknown_template() {
        ReceiptSnapshot snapshot = renderer(current, Optional.empty()).freeze(SINGLE);
        ReceiptSnapshot unknown = new ReceiptSnapshot(new ContentDigest("f".repeat(64)), snapshot.data(), snapshot.logo(), Optional.empty(), 1);

        assertThatIllegalStateException().isThrownBy(() -> renderer(current, Optional.empty()).render(unknown, FIRST_NUMBER, NOW))
                .withMessageContaining("is not stored");
    }

    @Test
    @DisplayName("Given a stored template that no longer matches its digest, when a receipt of it is rendered, then it is refused")
    void should_refuse_when_rendered_given_tampered_template() {
        InMemoryReceiptResources tampered = new InMemoryReceiptResources();
        ReceiptSnapshot snapshot = renderer(current, Optional.empty()).freeze(SINGLE);
        tampered.storeTemplate(snapshot.template(), current.content().replace("Obdarovaný", "Nikdo"), NOW);
        resources.image(snapshot.logo()).ifPresent(logo -> tampered.storeImage(snapshot.logo(), logo, NOW));
        ThymeleafPdfReceiptRenderer renderer = new ThymeleafPdfReceiptRenderer(tampered, current, InMemoryReceiptSignatures.holding(Optional.empty()),
                Clock.fixed(NOW, ZoneOffset.UTC));

        assertThatIllegalStateException().isThrownBy(() -> renderer.render(snapshot, FIRST_NUMBER, NOW))
                .withMessageContaining("does not match its digest");
    }

    @Test
    @DisplayName("Given a snapshot of a render profile this renderer does not have, when it is rendered, then it is refused")
    void should_refuse_when_rendered_given_unknown_render_profile() {
        ReceiptSnapshot snapshot = renderer(current, Optional.empty()).freeze(SINGLE);
        ReceiptSnapshot future = new ReceiptSnapshot(snapshot.template(), snapshot.data(), snapshot.logo(), Optional.empty(), 2);

        assertThatIllegalStateException().isThrownBy(() -> renderer(current, Optional.empty()).render(future, FIRST_NUMBER, NOW))
                .withMessageContaining("render profile 2");
    }

    @Test
    @DisplayName("Given the template from the classpath, when it is stored and read back, then it is the same template with the same digest")
    void should_round_trip_when_stored_and_read_given_classpath_template() {
        ReceiptTemplate read = ReceiptTemplate.fromContent(current.content());

        assertThat(read).isEqualTo(current);
        assertThat(read.digest()).isEqualTo(ContentDigest.of(current.content().getBytes(StandardCharsets.UTF_8)));
        assertThat(current.czech()).containsKey("receipt.donee").doesNotContainKey("receipt.fileName.single")
                .allSatisfy((key, text) -> assertThat(key).startsWith("receipt."));
        assertThat(current.english().get("receipt.donee")).isEqualTo("Donee");
    }

    private ThymeleafPdfReceiptRenderer renderer(ReceiptTemplate template, Optional<SignatureImage> signature) {
        return new ThymeleafPdfReceiptRenderer(resources, template, InMemoryReceiptSignatures.holding(signature), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static String text(byte[] pdf) {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return new PDFTextStripper().getText(document).replace(' ', ' ').replaceAll("\\s+", " ");
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }

    private static List<Integer> imageWidths(byte[] pdf) {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            PDResources page = document.getPage(0).getResources();
            List<Integer> widths = new ArrayList<>();
            for (var name : page.getXObjectNames()) {
                if (page.getXObject(name) instanceof PDImageXObject image) {
                    widths.add(image.getWidth());
                }
            }
            return widths;
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }
}
