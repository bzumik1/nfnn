package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.SignaturePath;
import cz.novanadeje.app.donations.domain.receipt.SignaturePathData;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import cz.novanadeje.app.donations.domain.receipt.SignatureViewBox;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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
    @DisplayName("Given a vector signature uploaded, when it is read, then the same vector comes back from its canonical SVG stored as a receipt image")
    void should_round_trip_when_replaced_given_vector_signature() {
        signatures.replace(VECTOR, NOW);
        flushAndClear();

        assertThat(signatures.current()).contains(new CurrentSignature(VECTOR, NOW));
        Map<String, Object> stored = jdbc.sql("select media_type, content from receipt_image where sha256 = ?").param(VECTOR.digest().value())
                .query().singleRow();
        assertThat(stored.get("media_type")).isEqualTo("image/svg+xml");
        assertThat(new String((byte[]) stored.get("content"), StandardCharsets.UTF_8)).isEqualTo(VECTOR.canonicalSvg());
        assertThat(jdbc.sql("select width || 'x' || height from donation_receipt_signature").query(String.class).single()).isEqualTo("1200x400");
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
