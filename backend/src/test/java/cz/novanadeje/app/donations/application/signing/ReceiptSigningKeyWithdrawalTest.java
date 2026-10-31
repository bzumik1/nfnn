package cz.novanadeje.app.donations.application.signing;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyAlreadyWithdrawn;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyNotFound;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyStatus;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyWithdrawalPaused;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.event.ReceiptSigningKeyWithdrawn;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.seal.SealVerdict;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactor;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof;
import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReceiptSigningKeyWithdrawalTest {

    private static final byte[] OWN_PUBLIC_KEY = HexFormat.of().parseHex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    private static final byte[] EARLIER_PUBLIC_KEY = HexFormat.of().parseHex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c");
    private static final ReceiptSigningKeyId OWN = ReceiptSigningKeyId.of(OWN_PUBLIC_KEY);
    private static final ReceiptSigningKeyId EARLIER_ID = ReceiptSigningKeyId.of(EARLIER_PUBLIC_KEY);
    private static final Instant EARLIER = Instant.parse("2026-11-01T07:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-20T09:30:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");
    private static final FreshSecondFactorProof CODE = new FreshSecondFactorProof(Optional.of("123456"), Optional.empty());

    private final StoredKeys stored = new StoredKeys();
    private final NamedSeals seals = new NamedSeals();
    private final ReceiptSigner signer = mock(ReceiptSigner.class);
    private final ListedTrail trail = new ListedTrail();
    private final FreshSecondFactor freshSecondFactor = mock(FreshSecondFactor.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final ReceiptSigningKeyWithdrawalRefusals refusals = mock(ReceiptSigningKeyWithdrawalRefusals.class);
    private final ReceiptSigningKeyWithdrawal withdrawal = new ReceiptSigningKeyWithdrawal(stored,
            new ReceiptSigningKeys(stored, seals, signer, id -> false, trail, Set::of), seals, freshSecondFactor, refusals, events,
            Clock.fixed(NOW, ZoneOffset.UTC));
    private final ListAppender<ILoggingEvent> lines = new ListAppender<>();

    @BeforeEach
    void keysAndLog() {
        when(signer.keyId()).thenReturn(OWN);
        stored.rows.add(ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content)));
        stored.rows.add(ReceiptSigningKey.register(OWN_PUBLIC_KEY, NOW.minusSeconds(3600), content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content)));
        lines.start();
        logger().addAppender(lines);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(lines);
    }

    @Test
    @DisplayName("Given the server's own published key, when an administrator withdraws it with a fresh second factor, then it is stored revoked and sealed again, audited, announced as the current key and warned")
    void should_store_revoked_audit_and_announce_when_withdrawn_given_the_current_key() {
        WithdrawnReceiptSigningKey withdrawn = withdrawal.withdraw(ADMIN, OWN, CODE);

        assertThat(withdrawn).isEqualTo(new WithdrawnReceiptSigningKey(OWN, true));
        verify(freshSecondFactor).require(ADMIN, CODE);
        assertThat(stored.row(OWN)).satisfies(key -> {
            assertThat(key.status()).isEqualTo(ReceiptSigningKeyStatus.REVOKED);
            assertThat(seals.check(ReceiptSigningKey.SEAL_PURPOSE, key.sealedContent(), key.seal())).isEqualTo(SealVerdict.SEALED_HERE);
        });
        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events, times(2)).publishEvent(published.capture());
        assertThat(published.getAllValues()).containsExactly(
                new AdminActionPerformed(ADMIN, "WITHDRAW_RECEIPT_SIGNING_KEY", Optional.empty(),
                        "Stažen klíč k ověřovacím QR 21fe31df (ověřeno druhým faktorem)", NOW),
                new ReceiptSigningKeyWithdrawn(ADMIN, "21fe31df", true, NOW));
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage()).isEqualTo("Admin " + ADMIN + " withdrew the receipt signing key 21fe31df");
        });
    }

    @Test
    @DisplayName("Given the server's own published key, when an administrator withdraws it, then the history read back from that audit entry records it as withdrawn")
    void should_record_withdrawal_in_history_read_back_when_withdrawn_given_the_current_key() {
        withdrawal.withdraw(ADMIN, OWN, CODE);

        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events, times(2)).publishEvent(published.capture());
        AdminActionPerformed audited = published.getAllValues().stream().filter(AdminActionPerformed.class::isInstance).map(AdminActionPerformed.class::cast)
                .findFirst().orElseThrow();
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(ReceiptSigningKeyHistoryTest.entryOf(audited)), Set.of());
        assertThat(history.isWithdrawn(OWN)).isTrue();
        assertThat(history.recorded()).containsExactly(OWN);
    }

    @Test
    @DisplayName("Given an earlier published key, when an administrator withdraws it, then it is revoked and announced as not the current key")
    void should_announce_not_current_when_withdrawn_given_an_earlier_key() {
        WithdrawnReceiptSigningKey withdrawn = withdrawal.withdraw(ADMIN, EARLIER_ID, CODE);

        assertThat(withdrawn.current()).isFalse();
        assertThat(stored.row(EARLIER_ID).status()).isEqualTo(ReceiptSigningKeyStatus.REVOKED);
        assertThat(stored.row(OWN).status()).isEqualTo(ReceiptSigningKeyStatus.ACTIVE);
        verify(events).publishEvent(new ReceiptSigningKeyWithdrawn(ADMIN, "39f713d0", false, NOW));
    }

    @Test
    @DisplayName("Given a refused second factor, when an administrator withdraws a key, then only the refusal is recorded and nothing is stored or announced")
    void should_record_only_the_refusal_when_withdrawn_given_a_refused_second_factor() {
        RuleViolation refused = new RuleViolation("donors/second-factor-code-rejected", "refused");
        doThrow(refused).when(freshSecondFactor).require(ADMIN, CODE);

        assertThatThrownBy(() -> withdrawal.withdraw(ADMIN, OWN, CODE)).isSameAs(refused);

        verify(refusals).record(ADMIN, OWN, NOW);
        assertThat(stored.saves).isZero();
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given a refused second factor, when an administrator withdraws a key, then the refusal is recorded without the row ever being locked, so a refused code never holds the row while it is audited")
    void should_record_the_refusal_without_locking_when_withdrawn_given_a_refused_second_factor() {
        doThrow(new RuleViolation("donors/second-factor-code-rejected", "refused")).when(freshSecondFactor).require(ADMIN, CODE);

        assertThatThrownBy(() -> withdrawal.withdraw(ADMIN, OWN, CODE)).isInstanceOf(RuleViolation.class);

        verify(refusals).record(ADMIN, OWN, NOW);
        assertThat(stored.locks).isZero();
    }

    @Test
    @DisplayName("Given five refused second factors of the administrator in the last quarter of an hour, when they withdraw a key, then the row is never locked")
    void should_not_lock_when_withdrawn_given_five_recent_refusals() {
        when(refusals.paused(ADMIN, NOW)).thenReturn(true);

        assertThatThrownBy(() -> withdrawal.withdraw(ADMIN, OWN, CODE)).isInstanceOf(ReceiptSigningKeyWithdrawalPaused.class);

        assertThat(stored.locks).isZero();
    }

    @Test
    @DisplayName("Given another withdrawal of the key committed while the second factor was checked, when the row is locked, then it is refused as already withdrawn and nothing is stored, audited or announced")
    void should_refuse_as_already_withdrawn_when_locked_given_a_withdrawal_committed_meanwhile() {
        stored.withdrawnBeforeLock = true;

        assertThatThrownBy(() -> withdrawal.withdraw(ADMIN, OWN, CODE)).isInstanceOf(ReceiptSigningKeyAlreadyWithdrawn.class);

        verify(freshSecondFactor).require(ADMIN, CODE);
        assertThat(stored.locks).isEqualTo(1);
        assertThat(stored.saves).isZero();
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given five refused second factors of the administrator in the last quarter of an hour, when they withdraw a key, then it is refused as paused before any second factor is checked")
    void should_refuse_as_paused_when_withdrawn_given_five_recent_refusals() {
        when(refusals.paused(ADMIN, NOW)).thenReturn(true);

        assertThatThrownBy(() -> withdrawal.withdraw(ADMIN, OWN, CODE)).isInstanceOf(ReceiptSigningKeyWithdrawalPaused.class)
                .hasFieldOrPropertyWithValue("code", "donations/receipt-signing-key-withdrawal-paused");

        verifyNoInteractions(freshSecondFactor);
        assertThat(stored.saves).isZero();
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("Admin " + ADMIN + " asked to withdraw a receipt signing key while it is paused after refused second factors");
        });
    }

    @Test
    @DisplayName("Given a key id no row has, when an administrator withdraws it, then it is refused as not found before any second factor is used")
    void should_refuse_as_not_found_when_withdrawn_given_an_unknown_key() {
        assertThatThrownBy(() -> withdrawal.withdraw(ADMIN, new ReceiptSigningKeyId("dac073e0"), CODE))
                .isInstanceOf(ReceiptSigningKeyNotFound.class).hasFieldOrPropertyWithValue("code", "donations/receipt-signing-key-not-found");

        verifyNoInteractions(freshSecondFactor);
        assertThat(stored.saves).isZero();
    }

    @Test
    @DisplayName("Given a key row whose seal fails, when an administrator withdraws it, then it is refused as not found, so a tampered row is never sealed")
    void should_refuse_as_not_found_when_withdrawn_given_an_unpublished_row() {
        stored.rows.set(0, stored.row(EARLIER_ID).sealedAgain("forged"));

        assertThatThrownBy(() -> withdrawal.withdraw(ADMIN, EARLIER_ID, CODE)).isInstanceOf(ReceiptSigningKeyNotFound.class);

        assertThat(stored.saves).isZero();
    }

    @Test
    @DisplayName("Given a key already withdrawn, when an administrator withdraws it again, then it is refused as already withdrawn and nothing is announced")
    void should_refuse_when_withdrawn_given_a_key_already_withdrawn() {
        withdrawal.withdraw(ADMIN, EARLIER_ID, CODE);
        clearInvocations(events, freshSecondFactor);

        assertThatThrownBy(() -> withdrawal.withdraw(ADMIN, EARLIER_ID, CODE)).isInstanceOf(ReceiptSigningKeyAlreadyWithdrawn.class)
                .hasFieldOrPropertyWithValue("code", "donations/receipt-signing-key-already-withdrawn");

        verifyNoInteractions(freshSecondFactor, events);
    }

    @Test
    @DisplayName("Given a withdrawn key whose row was put back as active, when an administrator withdraws it again, then the row is revoked again")
    void should_revoke_again_when_withdrawn_given_a_withdrawal_replayed_away() {
        trail.entries.add(ReceiptSigningKeyHistoryTest.withdrawn("39f713d0"));

        withdrawal.withdraw(ADMIN, EARLIER_ID, CODE);

        assertThat(stored.row(EARLIER_ID).status()).isEqualTo(ReceiptSigningKeyStatus.REVOKED);
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ReceiptSigningKeyWithdrawal.class);
    }

    private static final class StoredKeys implements ReceiptSigningKeyRepository {

        private final List<ReceiptSigningKey> rows = new ArrayList<>();
        private int saves;
        private int locks;
        private boolean withdrawnBeforeLock;

        ReceiptSigningKey row(ReceiptSigningKeyId id) {
            return rows.stream().filter(key -> key.id().equals(id)).findFirst().orElseThrow();
        }

        @Override
        public List<ReceiptSigningKey> findAll() {
            return List.copyOf(rows);
        }

        @Override
        public Optional<ReceiptSigningKey> lockForWithdrawal(ReceiptSigningKeyId id) {
            locks++;
            Optional<ReceiptSigningKey> row = rows.stream().filter(key -> key.id().equals(id)).findFirst();
            return withdrawnBeforeLock ? row.map(key -> key.withdrawn(content -> "here:" + HexFormat.of().formatHex(content).hashCode())) : row;
        }

        @Override
        public void save(ReceiptSigningKey key) {
            saves++;
            rows.replaceAll(existing -> existing.id().equals(key.id()) ? key : existing);
        }

        @Override
        public boolean recordRestoreAdoption(String restoreId, Instant adoptedAt) {
            throw new UnsupportedOperationException("a withdrawal adopts nothing");
        }
    }

    private static final class NamedSeals implements RecordSeals {

        @Override
        public String seal(String purpose, byte[] content) {
            return "here:" + HexFormat.of().formatHex(content).hashCode();
        }

        @Override
        public SealVerdict check(String purpose, byte[] content, String seal) {
            return seal.equals(seal(purpose, content)) ? SealVerdict.SEALED_HERE : SealVerdict.BROKEN;
        }
    }
}
