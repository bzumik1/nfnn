package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.SignaturePath;
import cz.novanadeje.app.donations.domain.receipt.SignaturePathData;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import cz.novanadeje.app.donations.domain.receipt.SignatureViewBox;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.infrastructure.pdf.ReceiptResources;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaReceiptSignatureRepositoryTest {

    private static final byte[] PNG_HEADER = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};
    private static final SignatureImage FIRST = image(1, 600, 200);
    private static final SignatureImage SECOND = image(2, 900, 300);
    private static final SignatureVector VECTOR = new SignatureVector(SignatureViewBox.parse("0 0 300 100"), List.of(
            new SignaturePath(SignaturePathData.parse("M10 80 C40 10 65 10 95 80 Z"), "#1d2a5c", new BigDecimal("0.9")),
            new SignaturePath(SignaturePathData.parse("m250 50 l40 40 z"), "#c0392b", BigDecimal.ONE)));

    @Autowired
    private ReceiptSignatureRepository signatures;
    @Autowired
    private ReceiptResources resources;
    @Autowired
    private ReceiptImageRepository receiptImages;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given nothing uploaded, when the current signature is read, then there is none and removing it changes nothing")
    void should_answer_nothing_when_read_given_nothing_uploaded() {
        assertThat(signatures.current()).isEmpty();
        assertThat(signatures.remove()).isFalse();
    }

    @Test
    @DisplayName("Given a signature uploaded, when it is read, then the image, its size and the upload time come back and the image is a receipt image")
    void should_round_trip_when_replaced_given_signature() {
        signatures.replace(FIRST, NOW);
        flushAndClear();

        assertThat(signatures.current()).contains(new CurrentSignature(FIRST, NOW));
        assertThat(jdbc.sql("select media_type from receipt_image where sha256 = ?").param(FIRST.digest().value()).query(String.class).single())
                .isEqualTo("image/png");
    }

    @Test
    @DisplayName("Given a vector signature uploaded, when the receipt images are asked for it, then its media type is JSON and its canonical bytes are served as stored without being read as a vector")
    void should_answer_media_type_and_canonical_bytes_when_asked_given_vector_signature() {
        signatures.replace(VECTOR, NOW);
        flushAndClear();

        assertThat(resources.imageMediaType(VECTOR.digest())).contains("application/json");
        assertThat(resources.imageMediaType(FIRST.digest())).isEmpty();
        assertThat(receiptImages.find(VECTOR.digest())).hasValueSatisfying(image -> {
            assertThat(image.mediaType()).isEqualTo("application/json");
            assertThat(image.content()).isEqualTo(VECTOR.canonicalBytes());
        });
    }

    @Test
    @DisplayName("Given a vector signature uploaded, when it is read, then the same vector comes back from its canonical JSON stored as a receipt image")
    void should_round_trip_when_replaced_given_vector_signature() {
        signatures.replace(VECTOR, NOW);
        flushAndClear();

        assertThat(signatures.current()).contains(new CurrentSignature(VECTOR, NOW));
        Map<String, Object> stored = jdbc.sql("select media_type, content from receipt_image where sha256 = ?").param(VECTOR.digest().value())
                .query().singleRow();
        assertThat(stored.get("media_type")).isEqualTo("application/json");
        assertThat((byte[]) stored.get("content")).isEqualTo(VECTOR.canonicalJson().getBytes(StandardCharsets.UTF_8));
        assertThat(jdbc.sql("select width || 'x' || height from donation_receipt_signature").query(String.class).single()).isEqualTo("1200x400");
    }

    @Test
    @DisplayName("Given a stored vector whose content was changed under its digest, when it is read, then it is a server fault naming only the digest")
    void should_fail_as_server_fault_when_read_given_vector_changed_under_its_digest() {
        signatures.replace(VECTOR, NOW);
        flushAndClear();
        String digest = VECTOR.digest().value();
        jdbc.sql("update receipt_image set content = ? where sha256 = ?")
                .params(VECTOR.canonicalJson().replace("#c0392b", "#000000").getBytes(StandardCharsets.UTF_8), digest).update();

        assertThatThrownBy(() -> signatures.current())
                .isExactlyInstanceOf(IllegalStateException.class)
                .hasMessage("The stored signature vector " + digest + " does not match its digest")
                .hasNoCause();
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
            "not JSON|<svg viewBox=\"0 0 1 1\"><path d=\"M0 0\"/></svg>|StreamReadException",
            "a path the domain refuses|{\"viewBox\":[0,0,300,100],\"paths\":[{\"d\":\"M0 0 L1 1\",\"fill\":\"red\",\"opacity\":1}]}|UnsupportedSignatureVector",
            "a missing view box|{\"paths\":[{\"d\":\"M0 0 L1 1\",\"fill\":\"#000000\",\"opacity\":1}]}|UnsupportedSignatureVector"
    })
    @DisplayName("Given a stored vector that matches its digest but no longer reads as a signature, when it is read, then it is a server fault naming the digest and the exception class only")
    void should_fail_as_server_fault_when_read_given_unreadable_vector_under_its_own_digest(String tampering, String content, String failure) {
        signatures.replace(VECTOR, NOW);
        flushAndClear();
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        String digest = ContentDigest.of(bytes).value();
        jdbc.sql("insert into receipt_image (sha256, media_type, content, first_used_at) values (?, 'application/json', ?, now())").params(digest, bytes).update();
        jdbc.sql("update donation_receipt_signature set image_sha256 = ?").param(digest).update();

        assertThatThrownBy(() -> signatures.current())
                .isExactlyInstanceOf(IllegalStateException.class)
                .hasMessage("The stored signature vector " + digest + " cannot be read: " + failure)
                .hasNoCause();
    }

    @Test
    @DisplayName("Given a stored vector that reads as a signature under its own digest but is not spelled canonically, when it is read, then it is a server fault naming only the digest")
    void should_fail_as_server_fault_when_read_given_vector_not_spelled_canonically() {
        signatures.replace(VECTOR, NOW);
        flushAndClear();
        byte[] bytes = VECTOR.canonicalJson().replace(",\"paths\"", ", \"paths\"").getBytes(StandardCharsets.UTF_8);
        String digest = ContentDigest.of(bytes).value();
        jdbc.sql("insert into receipt_image (sha256, media_type, content, first_used_at) values (?, 'application/json', ?, now())").params(digest, bytes).update();
        jdbc.sql("update donation_receipt_signature set image_sha256 = ?").param(digest).update();

        assertThatThrownBy(() -> signatures.current())
                .isExactlyInstanceOf(IllegalStateException.class)
                .hasMessage("The stored signature vector " + digest + " is not in its canonical form")
                .hasNoCause();
    }

    @Test
    @DisplayName("Given a scan uploaded, when the current scan is asked for, then the scan comes back")
    void should_answer_scan_when_current_scan_asked_given_scan() {
        signatures.replace(FIRST, NOW);
        flushAndClear();

        assertThat(signatures.currentScan()).contains(FIRST);
    }

    @Test
    @DisplayName("Given a vector signature whose content no longer reads, when the current scan is asked for, then there is none and the vector is not read")
    void should_answer_no_scan_without_reading_vector_when_current_scan_asked_given_unreadable_vector() {
        signatures.replace(VECTOR, NOW);
        flushAndClear();
        jdbc.sql("update receipt_image set content = ? where sha256 = ?").params("garbage".getBytes(StandardCharsets.UTF_8), VECTOR.digest().value()).update();

        assertThat(signatures.currentScan()).isEmpty();
    }

    @Test
    @DisplayName("Given nothing uploaded, when the current scan is asked for, then there is none")
    void should_answer_no_scan_when_current_scan_asked_given_nothing_uploaded() {
        assertThat(signatures.currentScan()).isEmpty();
    }

    @Test
    @DisplayName("Given a vector signature, when a scan replaces it, then the scan is current and the vector stays for issued receipts")
    void should_answer_scan_when_replaced_given_earlier_vector() {
        signatures.replace(VECTOR, NOW);
        flushAndClear();

        signatures.replace(FIRST, NOW.plusSeconds(60));
        flushAndClear();

        assertThat(signatures.current()).contains(new CurrentSignature(FIRST, NOW.plusSeconds(60)));
        assertThat(jdbc.sql("select count(*) from receipt_image where sha256 = ?").param(VECTOR.digest().value()).query(Long.class).single())
                .isEqualTo(1L);
    }

    @Test
    @DisplayName("Given a signature uploaded, when another one replaces it, then one row names the newer one and the older image stays for issued receipts")
    void should_keep_one_row_and_older_image_when_replaced_given_earlier_signature() {
        signatures.replace(FIRST, NOW);
        flushAndClear();
        Instant later = NOW.plusSeconds(3600);

        signatures.replace(SECOND, later);
        flushAndClear();

        assertThat(signatures.current()).contains(new CurrentSignature(SECOND, later));
        assertThat(jdbc.sql("select count(*) from donation_receipt_signature").query(Long.class).single()).isEqualTo(1L);
        assertThat(jdbc.sql("select count(*) from receipt_image where sha256 in (?, ?)").params(FIRST.digest().value(), SECOND.digest().value())
                .query(Long.class).single()).isEqualTo(2L);
    }

    @Test
    @DisplayName("Given a signature uploaded, when it is removed, then none is current and the image stays for issued receipts")
    void should_remove_row_and_keep_image_when_removed_given_signature() {
        signatures.replace(FIRST, NOW);
        flushAndClear();

        assertThat(signatures.remove()).isTrue();
        flushAndClear();

        assertThat(signatures.current()).isEmpty();
        assertThat(jdbc.sql("select count(*) from receipt_image where sha256 = ?").param(FIRST.digest().value()).query(Long.class).single())
                .isEqualTo(1L);
    }

    @Test
    @DisplayName("Given the schema, when a second row is inserted, then the singleton constraint refuses it")
    void should_refuse_when_inserted_given_second_row() {
        signatures.replace(FIRST, NOW);
        flushAndClear();

        assertThatThrownBy(() -> jdbc.sql("insert into donation_receipt_signature (id, image_sha256, width, height, uploaded_at) values (2, ?, 1, 1, now())")
                .param(FIRST.digest().value()).update())
                .hasMessageContaining("ck_donation_receipt_signature_singleton");
    }

    @Test
    @DisplayName("Given the schema, when the row names an image that is not stored, then the foreign key refuses it")
    void should_refuse_when_updated_given_unknown_image() {
        signatures.replace(FIRST, NOW);
        flushAndClear();

        assertThatThrownBy(() -> jdbc.sql("update donation_receipt_signature set image_sha256 = ?").param("0".repeat(64)).update())
                .hasMessageContaining("fk_donation_receipt_signature_image");
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }

    private static SignatureImage image(int marker, int width, int height) {
        byte[] png = java.util.Arrays.copyOf(PNG_HEADER, PNG_HEADER.length + 1);
        png[PNG_HEADER.length] = (byte) marker;
        return new SignatureImage(png, width, height);
    }
}
