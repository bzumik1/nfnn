package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyStatus;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaReceiptSigningKeyRepositoryTest {

    private static final byte[] PUBLIC_KEY = HexFormat.of().parseHex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    private static final byte[] OTHER_PUBLIC_KEY = HexFormat.of().parseHex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c");

    @Autowired
    private ReceiptSigningKeyRepository keys;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given two registered keys, when every key is read, then each comes back with its public key, registration time, status and seal")
    void should_round_trip_when_read_given_two_registered_keys() {
        ReceiptSigningKey first = ReceiptSigningKey.register(PUBLIC_KEY, NOW, content -> "v1:first");
        ReceiptSigningKey second = ReceiptSigningKey.register(OTHER_PUBLIC_KEY, NOW.plusSeconds(60), content -> "v1:second");
        keys.save(first);
        keys.save(second);
        flushAndClear();

        assertThat(keys.findAll()).containsExactlyInAnyOrder(first, second);
        assertThat(jdbc.sql("select status from receipt_signing_key where key_id = ?").param(first.id().value()).query(String.class).single())
                .isEqualTo("active");
    }

    @Test
    @DisplayName("Given two registered keys, when one is locked for a withdrawal, then that key comes back, and an unknown key does not")
    void should_return_the_named_key_when_locked_for_a_withdrawal_given_two_registered_keys() {
        ReceiptSigningKey first = ReceiptSigningKey.register(PUBLIC_KEY, NOW, content -> "v1:first");
        keys.save(first);
        keys.save(ReceiptSigningKey.register(OTHER_PUBLIC_KEY, NOW.plusSeconds(60), content -> "v1:second"));
        flushAndClear();

        assertThat(keys.lockForWithdrawal(first.id())).contains(first);
        assertThat(keys.lockForWithdrawal(new ReceiptSigningKeyId("dac073e0"))).isEmpty();
    }

    @Test
    @DisplayName("Given two registered keys, when one is locked for issuing, then that key comes back, and an unknown key does not")
    void should_return_the_named_key_when_locked_for_issuing_given_two_registered_keys() {
        ReceiptSigningKey first = ReceiptSigningKey.register(PUBLIC_KEY, NOW, content -> "v1:first");
        keys.save(first);
        keys.save(ReceiptSigningKey.register(OTHER_PUBLIC_KEY, NOW.plusSeconds(60), content -> "v1:second"));
        flushAndClear();

        assertThat(keys.lockForIssuing(first.id())).contains(first);
        assertThat(keys.lockForIssuing(new ReceiptSigningKeyId("dac073e0"))).isEmpty();
    }

    @Test
    @DisplayName("Given a registered key, when it is saved again with a new seal, then one row holds the new seal and the rest stays")
    void should_keep_one_row_with_new_seal_when_saved_again_given_registered_key() {
        ReceiptSigningKey key = ReceiptSigningKey.register(PUBLIC_KEY, NOW, content -> "v1:earlier-server");
        keys.save(key);
        flushAndClear();

        keys.save(key.sealedAgain("v1:this-server"));
        flushAndClear();

        assertThat(keys.findAll()).singleElement().satisfies(stored -> {
            assertThat(stored.seal()).isEqualTo("v1:this-server");
            assertThat(stored.registeredAt()).isEqualTo(key.registeredAt());
            assertThat(stored.status()).isEqualTo(ReceiptSigningKeyStatus.ACTIVE);
        });
    }

    @Test
    @DisplayName("Given a restore, when its adoption is recorded twice, then only the first records it and one row names it")
    void should_record_once_when_adoption_is_recorded_twice_given_one_restore() {
        assertThat(keys.recordRestoreAdoption("019a1b2c-0000-7000-8000-000000000001", NOW)).isTrue();
        assertThat(keys.recordRestoreAdoption("019a1b2c-0000-7000-8000-000000000001", NOW.plusSeconds(60))).isFalse();
        assertThat(keys.recordRestoreAdoption("2026-11-13T10:02:41Z", NOW)).isTrue();

        assertThat(jdbc.sql("select count(*) from receipt_signing_key_adoption where restore_id = ?").param("019a1b2c-0000-7000-8000-000000000001")
                .query(Integer.class).single()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a row with a public key that is not 32 bytes, when it is written, then the database refuses it")
    void should_refuse_row_when_written_given_public_key_of_wrong_length() {
        assertThatThrownBy(() -> insert("00000000", new byte[31], "active")).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("Given a row with a status other than active or revoked, when it is written, then the database refuses it")
    void should_refuse_row_when_written_given_unknown_status() {
        assertThatThrownBy(() -> insert("00000001", PUBLIC_KEY, "retired")).isInstanceOf(DataIntegrityViolationException.class);
    }

    private void insert(String keyId, byte[] publicKey, String status) {
        jdbc.sql("insert into receipt_signing_key (key_id, public_key, registered_at, status, seal) values (?, ?, ?, ?, 'v1:x')")
                .params(keyId, publicKey, Timestamp.from(Instant.parse("2026-11-13T08:00:00Z")), status).update();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
