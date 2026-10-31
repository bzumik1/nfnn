package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyStatus;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.seal.SealVerdict;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReceiptSigningKeysTest {

    private static final byte[] OWN_PUBLIC_KEY = HexFormat.of().parseHex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    private static final byte[] EARLIER_PUBLIC_KEY = HexFormat.of().parseHex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c");
    private static final Instant EARLIER = Instant.parse("2026-11-01T07:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-13T11:00:00Z");

    private final List<ReceiptSigningKey> stored = new ArrayList<>();
    private final List<ReceiptSigningKeyId> lockedForIssuing = new ArrayList<>();
    private final ReceiptSigner signer = mock(ReceiptSigner.class);
    private boolean outsideDevelopment;
    private final ListedTrail trail = new ListedTrail();
    private final Set<ReceiptSigningKeyId> keptAside = new HashSet<>();
    private final ReceiptSigningKeys keys = new ReceiptSigningKeys(new ListedKeys(stored, lockedForIssuing), new PrefixSeals(), signer,
            id -> outsideDevelopment && id.isPublicTestKey(), trail, () -> Set.copyOf(keptAside));

    @BeforeEach
    void ownKey() {
        when(signer.keyId()).thenReturn(ReceiptSigningKeyId.of(OWN_PUBLIC_KEY));
        stored.add(ReceiptSigningKey.register(OWN_PUBLIC_KEY, NOW, content -> PrefixSeals.HERE));
    }

    @Test
    @DisplayName("Given a key sealed under a carried settings key that no start adopted, when the keys are listed, then it is not published and the administrator sees it flagged")
    void should_not_publish_when_listed_given_a_key_sealed_by_a_carried_key() {
        stored.add(ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> PrefixSeals.CARRIED));

        assertThat(keys.published()).extracting(key -> key.id().value()).containsExactly("21fe31df");
        assertThat(keys.overview().keys()).filteredOn(key -> key.id().value().equals("39f713d0")).singleElement()
                .satisfies(key -> assertThat(key.published()).isFalse());
    }

    @Test
    @DisplayName("Given a row sealed here that pairs an earlier key id with another public key, when the keys are listed, then it is not published")
    void should_not_publish_when_listed_given_an_id_that_is_not_its_public_keys() {
        stored.add(new ReceiptSigningKey(ReceiptSigningKeyId.of(EARLIER_PUBLIC_KEY), OWN_PUBLIC_KEY, EARLIER, ReceiptSigningKeyStatus.ACTIVE,
                PrefixSeals.HERE));

        assertThat(keys.published()).extracting(key -> key.id().value()).containsExactly("21fe31df");
    }

    @Test
    @DisplayName("Given a server outside development and rows of public RFC 8032 test keys sealed here, when the keys are listed, then none is published and the current key is flagged")
    void should_publish_no_test_key_when_listed_given_a_server_outside_development() {
        outsideDevelopment = true;
        stored.add(ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> PrefixSeals.HERE));

        assertThat(keys.published()).isEmpty();
        assertThat(keys.overview().currentKeyPublished()).isFalse();
        assertThat(keys.overview().keys()).hasSize(2).allSatisfy(key -> assertThat(key.published()).isFalse());
    }

    @Test
    @DisplayName("Given the own key row missing, when the overview is read, then the current key is named and not published")
    void should_name_current_key_unpublished_when_overview_is_read_given_no_own_row() {
        stored.clear();

        assertThat(keys.overview().currentKeyId().value()).isEqualTo("21fe31df");
        assertThat(keys.overview().currentKeyPublished()).isFalse();
    }

    @Test
    @DisplayName("Given the history of the keys, when the keys are listed, then the history is read for the registrations, adoptions and withdrawals only")
    void should_read_the_key_actions_when_listed_given_the_trail() {
        keys.published();

        assertThat(trail.asked).containsExactly(Set.of("REGISTER_RECEIPT_SIGNING_KEY", "ADOPT_RECEIPT_SIGNING_KEY", "WITHDRAW_RECEIPT_SIGNING_KEY"));
    }

    @Test
    @DisplayName("Given a withdrawn key sealed here, when the keys are listed, then it stays published as revoked so its signatures read as withdrawn")
    void should_publish_as_revoked_when_listed_given_a_withdrawn_key() {
        stored.add(ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> PrefixSeals.HERE).withdrawn(content -> PrefixSeals.HERE));
        trail.entries.add(ReceiptSigningKeyHistoryTest.withdrawn("39f713d0"));

        assertThat(keys.published()).extracting(key -> key.id().value() + " " + key.status()).containsExactly("39f713d0 REVOKED", "21fe31df ACTIVE");
        assertThat(keys.overview().mismatches()).isEmpty();
    }

    @Test
    @DisplayName("Given a withdrawn key whose row was put back as active with its old seal, when the keys are listed, then it is published as revoked and the overview flags it as reverted")
    void should_publish_as_revoked_and_flag_when_listed_given_a_withdrawal_replayed_away() {
        stored.add(ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> PrefixSeals.HERE));
        trail.entries.add(ReceiptSigningKeyHistoryTest.withdrawn("39f713d0"));

        assertThat(keys.published()).extracting(key -> key.id().value() + " " + key.status()).containsExactly("39f713d0 REVOKED", "21fe31df ACTIVE");
        assertThat(keys.overview().mismatches())
                .containsExactly(new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("39f713d0"), ReceiptSigningKeyMismatch.Kind.REVERTED));
    }

    @Test
    @DisplayName("Given an active row sealed here of a key whose seed this server keeps aside as withdrawn, and no withdrawal in the trail, when the keys are listed, then it is published as revoked and the overview flags it as reverted")
    void should_publish_as_revoked_and_flag_when_listed_given_a_kept_aside_key_active_after_a_restore() {
        stored.add(ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> PrefixSeals.HERE));
        trail.entries.add(ReceiptSigningKeyHistoryTest.registered("39f713d0"));
        keptAside.add(new ReceiptSigningKeyId("39f713d0"));

        assertThat(keys.published()).extracting(key -> key.id().value() + " " + key.status()).containsExactly("39f713d0 REVOKED", "21fe31df ACTIVE");
        assertThat(keys.overview().mismatches())
                .containsExactly(new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("39f713d0"), ReceiptSigningKeyMismatch.Kind.REVERTED));
    }

    @Test
    @DisplayName("Given an earlier key registered in the trail whose row was deleted, when the overview is read, then it flags the key as missing")
    void should_flag_missing_when_overview_is_read_given_a_deleted_row() {
        trail.entries.add(ReceiptSigningKeyHistoryTest.registered("21fe31df"));
        trail.entries.add(ReceiptSigningKeyHistoryTest.adopted("39f713d0"));

        assertThat(keys.overview().mismatches())
                .containsExactly(new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("39f713d0"), ReceiptSigningKeyMismatch.Kind.MISSING));
    }

    @Test
    @DisplayName("Given the server's own key withdrawn in the trail, when the keys are asked for the current key while issuing, then they name it withdrawn, and published for an active own key")
    void should_name_withdrawn_current_key_when_asked_given_own_key_withdrawn() {
        assertThat(keys.currentKeyHeldForIssuing()).isEqualTo(currentKey(CurrentKeyForIssuing.State.PUBLISHED));

        trail.entries.add(ReceiptSigningKeyHistoryTest.withdrawn("21fe31df"));

        assertThat(keys.currentKeyHeldForIssuing()).isEqualTo(currentKey(CurrentKeyForIssuing.State.WITHDRAWN));
    }

    @Test
    @DisplayName("Given the server's own row missing, when the keys are asked for the current key while issuing, then they name it not published")
    void should_name_current_key_unpublished_when_asked_given_no_own_row() {
        stored.clear();

        assertThat(keys.currentKeyHeldForIssuing()).isEqualTo(currentKey(CurrentKeyForIssuing.State.UNPUBLISHED));
    }

    @Test
    @DisplayName("Given the server's own active row failing its seal, when the keys are asked for the current key while issuing, then they name it not published, as the overview does")
    void should_name_current_key_unpublished_when_asked_given_own_row_broken() {
        stored.set(0, stored.getFirst().sealedAgain("broken"));

        assertThat(keys.currentKeyHeldForIssuing()).isEqualTo(currentKey(CurrentKeyForIssuing.State.UNPUBLISHED));
        assertThat(keys.overview().currentKeyPublished()).isFalse();
    }

    @Test
    @DisplayName("Given the server's own key a public test key of RFC 8032 outside development, when the keys are asked for the current key while issuing, then they name it not published")
    void should_name_current_key_unpublished_when_asked_given_public_test_key_outside_development() {
        outsideDevelopment = true;

        assertThat(keys.currentKeyHeldForIssuing()).isEqualTo(currentKey(CurrentKeyForIssuing.State.UNPUBLISHED));
    }

    @Test
    @DisplayName("Given the server's own row withdrawn and failing its seal, when the keys are asked for the current key while issuing, then they name it withdrawn, so the pause wins")
    void should_name_current_key_withdrawn_when_asked_given_own_row_withdrawn_and_broken() {
        stored.set(0, stored.getFirst().withdrawn(content -> "broken"));

        assertThat(keys.currentKeyHeldForIssuing()).isEqualTo(currentKey(CurrentKeyForIssuing.State.WITHDRAWN));
    }

    private static CurrentKeyForIssuing currentKey(CurrentKeyForIssuing.State state) {
        return new CurrentKeyForIssuing(new ReceiptSigningKeyId("21fe31df"), state);
    }

    @Test
    @DisplayName("Given the server's own row, when the keys are asked for the current key while issuing, then the own row is locked for issuing, so a withdrawal committing meanwhile is waited for")
    void should_lock_the_own_row_for_issuing_when_asked_given_the_own_row() {
        keys.currentKeyHeldForIssuing();

        assertThat(lockedForIssuing).containsExactly(new ReceiptSigningKeyId("21fe31df"));
    }

    @Test
    @DisplayName("Given the server's own row withdrawn, when the overview is read, then the current key shows as revoked")
    void should_show_current_key_revoked_when_overview_is_read_given_own_row_withdrawn() {
        stored.set(0, stored.getFirst().withdrawn(content -> PrefixSeals.HERE));

        assertThat(keys.currentKeyHeldForIssuing()).isEqualTo(currentKey(CurrentKeyForIssuing.State.WITHDRAWN));
        assertThat(keys.overview().keys()).singleElement().satisfies(key -> {
            assertThat(key.status()).isEqualTo(ReceiptSigningKeyStatus.REVOKED);
            assertThat(key.published()).isTrue();
            assertThat(key.current()).isTrue();
        });
    }

    private record ListedKeys(List<ReceiptSigningKey> stored, List<ReceiptSigningKeyId> lockedForIssuing) implements ReceiptSigningKeyRepository {

        @Override
        public List<ReceiptSigningKey> findAll() {
            return List.copyOf(stored);
        }

        @Override
        public Optional<ReceiptSigningKey> lockForWithdrawal(ReceiptSigningKeyId id) {
            throw new UnsupportedOperationException("the list only reads");
        }

        @Override
        public Optional<ReceiptSigningKey> lockForIssuing(ReceiptSigningKeyId id) {
            lockedForIssuing.add(id);
            return stored.stream().filter(key -> key.id().equals(id)).findFirst();
        }

        @Override
        public void save(ReceiptSigningKey key) {
            throw new UnsupportedOperationException("the list only reads");
        }

        @Override
        public boolean recordRestoreAdoption(String restoreId, Instant adoptedAt) {
            throw new UnsupportedOperationException("the list only reads");
        }
    }

    private static final class PrefixSeals implements RecordSeals {

        private static final String HERE = "here";
        private static final String CARRIED = "carried";

        @Override
        public String seal(String purpose, byte[] content) {
            return HERE;
        }

        @Override
        public SealVerdict check(String purpose, byte[] content, String seal) {
            return switch (seal) {
                case HERE -> SealVerdict.SEALED_HERE;
                case CARRIED -> SealVerdict.SEALED_BY_CARRIED_KEY;
                default -> SealVerdict.BROKEN;
            };
        }
    }
}
