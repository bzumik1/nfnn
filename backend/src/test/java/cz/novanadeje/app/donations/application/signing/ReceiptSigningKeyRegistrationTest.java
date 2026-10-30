package cz.novanadeje.app.donations.application.signing;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyStatus;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.restore.FinishedRestore;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.seal.SealVerdict;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReceiptSigningKeyRegistrationTest {

    private static final byte[] OWN_PUBLIC_KEY = HexFormat.of().parseHex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    private static final byte[] EARLIER_PUBLIC_KEY = HexFormat.of().parseHex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c");
    private static final Instant NOW = Instant.parse("2026-11-13T08:15:30.123456Z");
    private static final Instant EARLIER = Instant.parse("2026-11-01T07:00:00Z");
    private static final String RESTORE = "019a1b2c-0000-7000-8000-000000000001";

    private final ReceiptSigner signer = mock(ReceiptSigner.class);
    private final StoredKeys keys = new StoredKeys();
    private final MarkedSeals seals = new MarkedSeals();
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final WatchedTransactions transactions = new WatchedTransactions();
    private final LinesWithTransaction lines = new LinesWithTransaction(transactions);
    private Optional<FinishedRestore> lastRestore = Optional.empty();
    private final ReceiptSigningKeyRegistration registration = new ReceiptSigningKeyRegistration(signer, keys, seals, () -> lastRestore, events,
            transactions, Clock.fixed(NOW, ZoneOffset.UTC));

    @BeforeEach
    void ownKeyAndLog() {
        when(signer.keyId()).thenReturn(ReceiptSigningKeyId.of(OWN_PUBLIC_KEY));
        when(signer.publicKey()).thenReturn(OWN_PUBLIC_KEY.clone());
        lines.start();
        logger().addAppender(lines);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(lines);
    }

    @Test
    @DisplayName("Given no registered key, when the server registers its own, then it stores it active and sealed and audits it with the server as the actor")
    void should_store_and_audit_own_key_when_registering_given_no_registered_key() {
        registration.registerOwnKey();

        assertThat(keys.stored).singleElement().satisfies(key -> {
            assertThat(key.id().value()).isEqualTo("21fe31df");
            assertThat(key.publicKey()).isEqualTo(OWN_PUBLIC_KEY);
            assertThat(key.registeredAt()).isEqualTo(Instant.parse("2026-11-13T08:15:30Z"));
            assertThat(key.status()).isEqualTo(ReceiptSigningKeyStatus.ACTIVE);
            assertThat(seals.check(ReceiptSigningKey.SEAL_PURPOSE, key.sealedContent(), key.seal())).isEqualTo(SealVerdict.SEALED_HERE);
        });
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audited.capture());
        assertThat(audited.getValue().adminId()).isEqualTo(AdminActionPerformed.SERVER);
        assertThat(audited.getValue().action()).isEqualTo(ReceiptSigningKeyRegistration.ACTION);
        assertThat(audited.getValue().details()).isEqualTo("Server zaregistroval svůj klíč k ověřovacím QR na potvrzeních o daru: 21fe31df");
    }

    @Test
    @DisplayName("Given no registered key, when the server registers its own, then the WARN line is written once the transaction is over")
    void should_warn_after_the_transaction_when_registering_given_no_registered_key() {
        registration.registerOwnKey();

        assertThat(transactions.runs).isEqualTo(1);
        assertThat(lines.written).singleElement().satisfies(line -> {
            assertThat(line.level()).isEqualTo(Level.WARN);
            assertThat(line.message()).isEqualTo("Receipt signing key 21fe31df registered and published");
            assertThat(line.insideTransaction()).isFalse();
        });
    }

    @Test
    @DisplayName("Given its own key already registered, when the server starts again, then it stores, audits and logs nothing")
    void should_store_and_audit_nothing_when_registering_given_own_key_registered() {
        registration.registerOwnKey();
        lines.written.clear();

        registration.registerOwnKey();

        assertThat(keys.stored).hasSize(1);
        assertThat(keys.saves).isEqualTo(1);
        verify(events, times(1)).publishEvent(any(AdminActionPerformed.class));
        assertThat(lines.written).isEmpty();
    }

    @Test
    @DisplayName("Given a key sealed under the settings key the backup carried and a restore that finished just before this start, when the server registers its own, then it seals that key again, audits the adoption and warns after the transaction")
    void should_adopt_and_audit_when_registering_given_carried_key_and_a_fresh_restore() {
        ReceiptSigningKey earlier = ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> seals.carried(content));
        keys.stored.add(earlier);
        lastRestore = Optional.of(new FinishedRestore(RESTORE, NOW.minus(Duration.ofMinutes(3))));

        registration.registerOwnKey();

        ReceiptSigningKey resealed = keys.stored.stream().filter(key -> key.id().equals(earlier.id())).findFirst().orElseThrow();
        assertThat(seals.check(ReceiptSigningKey.SEAL_PURPOSE, resealed.sealedContent(), resealed.seal())).isEqualTo(SealVerdict.SEALED_HERE);
        assertThat(resealed.registeredAt()).isEqualTo(earlier.registeredAt());
        assertThat(keys.adoptions).containsExactly(RESTORE);
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events, times(2)).publishEvent(audited.capture());
        assertThat(audited.getAllValues()).filteredOn(action -> action.action().equals(ReceiptSigningKeyRegistration.ADOPT_ACTION)).singleElement()
                .satisfies(action -> {
                    assertThat(action.adminId()).isEqualTo(AdminActionPerformed.SERVER);
                    assertThat(action.details()).isEqualTo("Server převzal klíč k ověřovacím QR 39f713d0 z obnovené zálohy (obnova " + RESTORE + ")");
                });
        assertThat(lines.written).filteredOn(line -> line.message().contains("39f713d0")).singleElement().satisfies(line -> {
            assertThat(line.level()).isEqualTo(Level.WARN);
            assertThat(line.message()).isEqualTo("Receipt signing key 39f713d0 from a restored backup is sealed again and published");
            assertThat(line.insideTransaction()).isFalse();
        });
    }

    @Test
    @DisplayName("Given a key sealed under the settings key the backup carried and no restore, when the server registers its own, then that key is left unpublished and an ERROR names it")
    void should_leave_carried_key_and_log_error_when_registering_given_no_restore() {
        ReceiptSigningKey earlier = ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> seals.carried(content));
        keys.stored.add(earlier);

        registration.registerOwnKey();

        assertThat(keys.stored).contains(earlier);
        verify(events, times(1)).publishEvent(any(AdminActionPerformed.class));
        assertThat(lines.written).filteredOn(line -> line.message().contains("39f713d0")).singleElement().satisfies(line -> {
            assertThat(line.level()).isEqualTo(Level.ERROR);
            assertThat(line.message())
                    .isEqualTo("Receipt signing key 39f713d0 is sealed by the settings key of another server and no restore confirms it, so it is not published");
            assertThat(line.insideTransaction()).isFalse();
        });
    }

    @Test
    @DisplayName("Given a key sealed under the settings key the backup carried and a restore that finished more than an hour before, when the server registers its own, then that key is left unpublished")
    void should_leave_carried_key_when_registering_given_a_restore_finished_over_an_hour_before() {
        ReceiptSigningKey earlier = ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> seals.carried(content));
        keys.stored.add(earlier);
        lastRestore = Optional.of(new FinishedRestore(RESTORE, NOW.minus(Duration.ofMinutes(61))));

        registration.registerOwnKey();

        assertThat(keys.stored).contains(earlier);
        assertThat(keys.adoptions).isEmpty();
        assertThat(lines.written).anySatisfy(line -> assertThat(line.message()).contains("39f713d0 is sealed by the settings key of another server"));
    }

    @Test
    @DisplayName("Given a restore that an earlier start already used, when a key sealed under a carried settings key turns up later, then that key is left unpublished")
    void should_leave_carried_key_when_registering_given_the_restore_was_used_at_an_earlier_start() {
        lastRestore = Optional.of(new FinishedRestore(RESTORE, NOW.minus(Duration.ofMinutes(3))));
        registration.registerOwnKey();
        ReceiptSigningKey planted = ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> seals.carried(content));
        keys.stored.add(planted);

        registration.registerOwnKey();

        assertThat(keys.stored).contains(planted);
        assertThat(keys.adoptions).containsExactly(RESTORE);
        verify(events, never()).publishEvent(org.mockito.ArgumentMatchers.<AdminActionPerformed>argThat(
                action -> action.action().equals(ReceiptSigningKeyRegistration.ADOPT_ACTION)));
    }

    @Test
    @DisplayName("Given a key whose seal is broken, when the server registers its own, then that key stays as it was, is not sealed again and an ERROR names it after the transaction")
    void should_leave_broken_key_and_log_error_when_registering_given_broken_seal() {
        ReceiptSigningKey tampered = new ReceiptSigningKey(ReceiptSigningKeyId.of(EARLIER_PUBLIC_KEY), EARLIER_PUBLIC_KEY, EARLIER,
                ReceiptSigningKeyStatus.ACTIVE, "v1:forged");
        keys.stored.add(tampered);
        lastRestore = Optional.of(new FinishedRestore(RESTORE, NOW.minus(Duration.ofMinutes(3))));

        registration.registerOwnKey();

        assertThat(keys.stored).contains(tampered).hasSize(2);
        assertThat(keys.saves).isEqualTo(1);
        assertThat(lines.written).filteredOn(line -> line.message().contains("39f713d0")).singleElement().satisfies(line -> {
            assertThat(line.level()).isEqualTo(Level.ERROR);
            assertThat(line.message()).isEqualTo("Receipt signing key 39f713d0 fails its seal, so it is not published");
            assertThat(line.insideTransaction()).isFalse();
        });
    }

    @Test
    @DisplayName("Given a key sealed here whose id is not the start of its public key's SHA-256, when the server registers its own, then that key is not sealed again and an ERROR names it")
    void should_log_error_when_registering_given_an_id_that_does_not_belong_to_its_public_key() {
        ReceiptSigningKeyId earlierId = ReceiptSigningKeyId.of(EARLIER_PUBLIC_KEY);
        ReceiptSigningKey swapped = new ReceiptSigningKey(earlierId, OWN_PUBLIC_KEY, EARLIER, ReceiptSigningKeyStatus.ACTIVE, "seal");
        keys.stored.add(swapped.sealedAgain(seals.seal(ReceiptSigningKey.SEAL_PURPOSE, swapped.sealedContent())));

        registration.registerOwnKey();

        assertThat(lines.written).anySatisfy(line -> {
            assertThat(line.level()).isEqualTo(Level.ERROR);
            assertThat(line.message()).isEqualTo("Receipt signing key 39f713d0 fails its seal, so it is not published");
        });
    }

    @Test
    @DisplayName("Given a key of an earlier server sealed here, when the server registers its own, then it adds its own and audits only that")
    void should_audit_only_own_key_when_registering_given_earlier_key_sealed_here() {
        keys.stored.add(ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content)));

        registration.registerOwnKey();

        assertThat(keys.saves).isEqualTo(1);
        verify(events, times(1)).publishEvent(any(AdminActionPerformed.class));
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ReceiptSigningKeyRegistration.class);
    }

    private record Line(Level level, String message, boolean insideTransaction) {
    }

    private static final class WatchedTransactions implements TransactionOperations {

        private boolean inside;
        private int runs;

        @Override
        public <T> T execute(TransactionCallback<T> action) {
            runs++;
            inside = true;
            try {
                TransactionStatus status = new SimpleTransactionStatus();
                return action.doInTransaction(status);
            } finally {
                inside = false;
            }
        }
    }

    private static final class LinesWithTransaction extends AppenderBase<ILoggingEvent> {

        private final WatchedTransactions transactions;
        private final List<Line> written = new ArrayList<>();

        private LinesWithTransaction(WatchedTransactions transactions) {
            this.transactions = transactions;
        }

        @Override
        protected void append(ILoggingEvent event) {
            written.add(new Line(event.getLevel(), event.getFormattedMessage(), transactions.inside));
        }
    }

    private static final class StoredKeys implements ReceiptSigningKeyRepository {

        private final List<ReceiptSigningKey> stored = new ArrayList<>();
        private final Set<String> adoptions = new HashSet<>();
        private int saves;

        @Override
        public List<ReceiptSigningKey> findAll() {
            return List.copyOf(stored);
        }

        @Override
        public void save(ReceiptSigningKey key) {
            saves++;
            stored.removeIf(existing -> existing.id().equals(key.id()));
            stored.add(key);
        }

        @Override
        public boolean recordRestoreAdoption(String restoreId, Instant adoptedAt) {
            return adoptions.add(restoreId);
        }
    }

    private static final class MarkedSeals implements RecordSeals {

        private static final String HERE = "here:";
        private static final String CARRIED = "carried:";

        @Override
        public String seal(String purpose, byte[] content) {
            return HERE + mark(purpose, content);
        }

        String carried(byte[] content) {
            return CARRIED + mark(ReceiptSigningKey.SEAL_PURPOSE, content);
        }

        @Override
        public SealVerdict check(String purpose, byte[] content, String seal) {
            if (seal.equals(HERE + mark(purpose, content))) {
                return SealVerdict.SEALED_HERE;
            }
            return seal.equals(CARRIED + mark(purpose, content)) ? SealVerdict.SEALED_BY_CARRIED_KEY : SealVerdict.BROKEN;
        }

        private static String mark(String purpose, byte[] content) {
            return Integer.toHexString(Arrays.hashCode(content) ^ purpose.hashCode());
        }
    }
}
