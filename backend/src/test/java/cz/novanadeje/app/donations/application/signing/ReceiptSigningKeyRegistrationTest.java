package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyStatus;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.seal.SealVerdict;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReceiptSigningKeyRegistrationTest {

    private static final byte[] OWN_PUBLIC_KEY = HexFormat.of().parseHex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    private static final byte[] EARLIER_PUBLIC_KEY = HexFormat.of().parseHex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c");
    private static final Instant NOW = Instant.parse("2026-11-13T08:15:30.123456Z");
    private static final Instant EARLIER = Instant.parse("2026-11-01T07:00:00Z");

    private final ReceiptSigner signer = mock(ReceiptSigner.class);
    private final StoredKeys keys = new StoredKeys();
    private final MarkedSeals seals = new MarkedSeals();
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final ReceiptSigningKeyRegistration registration = new ReceiptSigningKeyRegistration(signer, keys, seals, events,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @BeforeEach
    void ownKey() {
        when(signer.keyId()).thenReturn(ReceiptSigningKeyId.of(OWN_PUBLIC_KEY));
        when(signer.publicKey()).thenReturn(OWN_PUBLIC_KEY.clone());
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
    @DisplayName("Given its own key already registered, when the server starts again, then it stores and audits nothing")
    void should_store_and_audit_nothing_when_registering_given_own_key_registered() {
        registration.registerOwnKey();

        registration.registerOwnKey();

        assertThat(keys.stored).hasSize(1);
        assertThat(keys.saves).isEqualTo(1);
        verify(events, times(1)).publishEvent(any(AdminActionPerformed.class));
    }

    @Test
    @DisplayName("Given a key of an earlier server sealed under the settings key the backup carried, when the new server registers its own, then it seals that key again and adds its own")
    void should_seal_again_and_add_own_when_registering_given_key_sealed_by_carried_key() {
        ReceiptSigningKey earlier = ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> seals.carried(content));
        keys.stored.add(earlier);

        registration.registerOwnKey();

        assertThat(keys.stored).hasSize(2);
        ReceiptSigningKey resealed = keys.stored.stream().filter(key -> key.id().equals(earlier.id())).findFirst().orElseThrow();
        assertThat(seals.check(ReceiptSigningKey.SEAL_PURPOSE, resealed.sealedContent(), resealed.seal())).isEqualTo(SealVerdict.SEALED_HERE);
        assertThat(resealed.registeredAt()).isEqualTo(earlier.registeredAt());
    }

    @Test
    @DisplayName("Given a key whose seal is broken, when the server registers its own, then that key stays as it was and is not sealed again")
    void should_leave_broken_key_when_registering_given_broken_seal() {
        ReceiptSigningKey tampered = new ReceiptSigningKey(ReceiptSigningKeyId.of(EARLIER_PUBLIC_KEY), EARLIER_PUBLIC_KEY, EARLIER,
                ReceiptSigningKeyStatus.ACTIVE, "v1:forged");
        keys.stored.add(tampered);

        registration.registerOwnKey();

        assertThat(keys.stored).contains(tampered).hasSize(2);
        assertThat(keys.saves).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a key of an earlier server sealed here, when the server registers its own, then it adds its own and audits only that")
    void should_audit_only_own_key_when_registering_given_earlier_key_sealed_here() {
        keys.stored.add(ReceiptSigningKey.register(EARLIER_PUBLIC_KEY, EARLIER, content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content)));

        registration.registerOwnKey();

        assertThat(keys.saves).isEqualTo(1);
        verify(events, times(1)).publishEvent(any(AdminActionPerformed.class));
    }

    private static final class StoredKeys implements ReceiptSigningKeyRepository {

        private final List<ReceiptSigningKey> stored = new ArrayList<>();
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
