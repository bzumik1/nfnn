package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptSigningKeyHistoryTest {

    private static final byte[] OWN_PUBLIC_KEY = HexFormat.of().parseHex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    private static final byte[] EARLIER_PUBLIC_KEY = HexFormat.of().parseHex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c");
    private static final Instant NOW = Instant.parse("2026-11-13T11:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");

    static AdminActionEntry registered(String keyId) {
        return entry(AdminActionPerformed.SERVER, ReceiptSigningKeyRegistration.ACTION,
                "Server zaregistroval svůj klíč k ověřovacím QR na potvrzeních o daru: " + keyId);
    }

    static AdminActionEntry adopted(String keyId) {
        return entry(AdminActionPerformed.SERVER, ReceiptSigningKeyRegistration.ADOPT_ACTION,
                "Server převzal klíč k ověřovacím QR " + keyId + " z obnovené zálohy (obnova 019a1b2c-0000-7000-8000-000000000001)");
    }

    static AdminActionEntry withdrawn(String keyId) {
        return entry(ADMIN, ReceiptSigningKeyWithdrawal.ACTION, ReceiptSigningKeyWithdrawal.details(new ReceiptSigningKeyId(keyId)));
    }

    private static AdminActionEntry entry(UUID adminId, String action, String details) {
        return new AdminActionEntry(UUID.randomUUID(), adminId, action, Optional.empty(), details, NOW, Optional.empty());
    }

    private static ReceiptSigningKey active(byte[] publicKey) {
        return ReceiptSigningKey.register(publicKey, NOW, content -> "seal");
    }

    @Test
    @DisplayName("Given the audit trail names the actions on the keys, when the history reads them, then it knows which keys were recorded and which withdrawn")
    void should_know_recorded_and_withdrawn_keys_when_read_given_the_trail() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("21fe31df"), adopted("39f713d0"), withdrawn("39f713d0")));

        assertThat(history.recorded()).extracting(ReceiptSigningKeyId::value).containsExactlyInAnyOrder("21fe31df", "39f713d0");
        assertThat(history.isWithdrawn(new ReceiptSigningKeyId("39f713d0"))).isTrue();
        assertThat(history.isWithdrawn(new ReceiptSigningKeyId("21fe31df"))).isFalse();
    }

    @Test
    @DisplayName("Given an entry of another action or details of another shape, when the history reads them, then it ignores them")
    void should_ignore_other_actions_and_shapes_when_read_given_foreign_entries() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(
                entry(ADMIN, "CHANGE_SETTINGS", "Změněna nastavení: 21fe31df"),
                entry(ADMIN, ReceiptSigningKeyWithdrawal.ACTION, "Stažen klíč: 21fe31df")));

        assertThat(history.recorded()).isEmpty();
        assertThat(history.isWithdrawn(new ReceiptSigningKeyId("21fe31df"))).isFalse();
    }

    @Test
    @DisplayName("Given rows that agree with the trail, when they are checked, then nothing is out of place")
    void should_find_nothing_when_checked_given_rows_that_agree() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("21fe31df"), adopted("39f713d0"), withdrawn("39f713d0")));

        assertThat(history.mismatches(List.of(active(OWN_PUBLIC_KEY), active(EARLIER_PUBLIC_KEY).withdrawn(content -> "seal")))).isEmpty();
    }

    @Test
    @DisplayName("Given a withdrawn key whose row is active again, when the rows are checked, then the key is reported as reverted")
    void should_report_reverted_when_checked_given_a_withdrawn_key_active_again() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("21fe31df"), withdrawn("21fe31df")));

        assertThat(history.mismatches(List.of(active(OWN_PUBLIC_KEY))))
                .containsExactly(new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("21fe31df"), ReceiptSigningKeyMismatch.Kind.REVERTED));
    }

    @Test
    @DisplayName("Given keys the trail registered, adopted or withdrew whose rows are gone, when the rows are checked, then each is reported as missing, in id order")
    void should_report_missing_when_checked_given_recorded_keys_without_rows() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("21fe31df"), adopted("39f713d0"), withdrawn("dac073e0")));

        assertThat(history.mismatches(List.of())).containsExactly(
                new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("21fe31df"), ReceiptSigningKeyMismatch.Kind.MISSING),
                new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("39f713d0"), ReceiptSigningKeyMismatch.Kind.MISSING),
                new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("dac073e0"), ReceiptSigningKeyMismatch.Kind.MISSING));
    }

    @Test
    @DisplayName("Given a row the trail never names, when the rows are checked, then it is not reported, because the seal already judges rows")
    void should_not_report_when_checked_given_a_row_without_trail_entries() {
        assertThat(ReceiptSigningKeyHistory.of(List.of()).mismatches(List.of(active(OWN_PUBLIC_KEY)))).isEmpty();
    }
}
