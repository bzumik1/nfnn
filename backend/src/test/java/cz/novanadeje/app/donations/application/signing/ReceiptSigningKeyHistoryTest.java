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
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptSigningKeyHistoryTest {

    private static final byte[] OWN_PUBLIC_KEY = HexFormat.of().parseHex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    private static final byte[] EARLIER_PUBLIC_KEY = HexFormat.of().parseHex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c");
    private static final Instant NOW = Instant.parse("2026-11-13T11:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");
    private static final UUID UNREADABLE_WITHDRAWAL = UUID.fromString("019a1c00-0000-7000-8000-0000000000e1");
    private static final UUID UNREADABLE_REGISTRATION = UUID.fromString("019a1c00-0000-7000-8000-0000000000e2");
    private static final UUID UNREADABLE_ADOPTION = UUID.fromString("019a1c00-0000-7000-8000-0000000000e3");

    static AdminActionEntry registered(String keyId) {
        return entry(AdminActionPerformed.SERVER, ReceiptSigningKeyRegistration.ACTION, ReceiptSigningKeyAuditDetails.registered(new ReceiptSigningKeyId(keyId)));
    }

    static AdminActionEntry adopted(String keyId) {
        return entry(AdminActionPerformed.SERVER, ReceiptSigningKeyRegistration.ADOPT_ACTION,
                ReceiptSigningKeyAuditDetails.adopted(new ReceiptSigningKeyId(keyId), "019a1b2c-0000-7000-8000-000000000001"));
    }

    static AdminActionEntry withdrawn(String keyId) {
        return entry(ADMIN, ReceiptSigningKeyWithdrawal.ACTION, ReceiptSigningKeyAuditDetails.withdrawn(new ReceiptSigningKeyId(keyId)));
    }

    static AdminActionEntry entryOf(AdminActionPerformed performed) {
        return new AdminActionEntry(UUID.randomUUID(), performed.adminId(), performed.action(), performed.subjectId(), performed.details(),
                performed.performedAt(), Optional.empty());
    }

    static AdminActionEntry unreadable(UUID id, String action, String details) {
        return new AdminActionEntry(id, ADMIN, action, Optional.empty(), details, NOW, Optional.empty());
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
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("21fe31df"), adopted("39f713d0"), withdrawn("39f713d0")), Set.of());

        assertThat(history.recorded()).extracting(ReceiptSigningKeyId::value).containsExactlyInAnyOrder("21fe31df", "39f713d0");
        assertThat(history.isWithdrawn(new ReceiptSigningKeyId("39f713d0"))).isTrue();
        assertThat(history.isWithdrawn(new ReceiptSigningKeyId("21fe31df"))).isFalse();
    }

    @Test
    @DisplayName("Given a withdrawal recorded under its earlier wording, when the history reads the trail, then the key is withdrawn")
    void should_count_key_as_withdrawn_when_read_given_a_withdrawal_in_its_earlier_wording() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("21fe31df"),
                entry(ADMIN, ReceiptSigningKeyWithdrawal.ACTION, "Stažen klíč k ověřovacím QR 21fe31df (ověřeno druhým faktorem)")), Set.of());

        assertThat(history.isWithdrawn(new ReceiptSigningKeyId("21fe31df"))).isTrue();
    }

    @Test
    @DisplayName("Given a withdrawn key, when its audit details are written, then they call the withdrawal by its name")
    void should_name_the_withdrawal_when_details_written_given_a_withdrawn_key() {
        assertThat(ReceiptSigningKeyAuditDetails.withdrawn(new ReceiptSigningKeyId("21fe31df")))
                .isEqualTo("Zneplatněn klíč k ověřovacím QR 21fe31df (ověřeno druhým faktorem)");
    }

    @Test
    @DisplayName("Given a key whose seed this server keeps aside as withdrawn and a trail without its withdrawal, as after a backup from before the withdrawal was restored, when the history reads them, then the key is withdrawn and its active row is reported as reverted")
    void should_count_kept_aside_key_as_withdrawn_when_read_given_a_trail_without_its_withdrawal() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("39f713d0"), registered("21fe31df")),
                Set.of(new ReceiptSigningKeyId("39f713d0")));

        assertThat(history.isWithdrawn(new ReceiptSigningKeyId("39f713d0"))).isTrue();
        assertThat(history.isWithdrawn(new ReceiptSigningKeyId("21fe31df"))).isFalse();
        assertThat(history.mismatches(List.of(active(EARLIER_PUBLIC_KEY), active(OWN_PUBLIC_KEY))))
                .containsExactly(new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("39f713d0"), ReceiptSigningKeyMismatch.Kind.REVERTED));
    }

    @Test
    @DisplayName("Given a key whose seed this server keeps aside as withdrawn but that has no row and no trail entry, when the rows are checked, then nothing is reported, because a key without a row is not published")
    void should_not_report_when_checked_given_a_kept_aside_key_without_row() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(), Set.of(new ReceiptSigningKeyId("39f713d0")));

        assertThat(history.mismatches(List.of(active(OWN_PUBLIC_KEY)))).isEmpty();
    }

    @Test
    @DisplayName("Given an entry of another action, when the history reads it, then it ignores it")
    void should_ignore_other_actions_when_read_given_a_foreign_entry() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(entry(ADMIN, "CHANGE_SETTINGS", "Změněna nastavení: 21fe31df")), Set.of());

        assertThat(history.recorded()).isEmpty();
        assertThat(history.unreadable()).isEmpty();
    }

    @Test
    @DisplayName("Given entries of the key actions whose details match no wording, when the history reads them, then each is reported as unreadable with its id, action and time, in the trail's order, and no key counts as recorded or withdrawn")
    void should_report_unreadable_entries_when_read_given_key_entries_whose_details_match_no_wording() {
        AdminActionEntry withdrawal = unreadable(UNREADABLE_WITHDRAWAL, ReceiptSigningKeyWithdrawal.ACTION, "Stažen klíč: 21fe31df");
        AdminActionEntry registration = unreadable(UNREADABLE_REGISTRATION, ReceiptSigningKeyRegistration.ACTION, "Server zaregistroval klíč 21fe31df");
        AdminActionEntry adoption = unreadable(UNREADABLE_ADOPTION, ReceiptSigningKeyRegistration.ADOPT_ACTION, "Server převzal klíč k ověřovacím QR 39f713d0");

        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("39f713d0"), withdrawal, registration, adoption), Set.of());

        assertThat(history.unreadable()).containsExactly(
                new UnreadableKeyAuditEntry(UNREADABLE_WITHDRAWAL, ReceiptSigningKeyWithdrawal.ACTION, NOW),
                new UnreadableKeyAuditEntry(UNREADABLE_REGISTRATION, ReceiptSigningKeyRegistration.ACTION, NOW),
                new UnreadableKeyAuditEntry(UNREADABLE_ADOPTION, ReceiptSigningKeyRegistration.ADOPT_ACTION, NOW));
        assertThat(history.recorded()).extracting(ReceiptSigningKeyId::value).containsExactly("39f713d0");
        assertThat(history.isWithdrawn(new ReceiptSigningKeyId("21fe31df"))).isFalse();
    }

    @Test
    @DisplayName("Given entries of the key actions in every wording the server has written, spelled out, when the history reads them, then none is unreadable and each names its key")
    void should_report_nothing_unreadable_when_read_given_every_wording_ever_written() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(
                entry(AdminActionPerformed.SERVER, ReceiptSigningKeyRegistration.ACTION,
                        "Server zaregistroval svůj klíč k ověřovacím QR na potvrzeních o daru: 21fe31df"),
                entry(AdminActionPerformed.SERVER, ReceiptSigningKeyRegistration.ADOPT_ACTION,
                        "Server převzal klíč k ověřovacím QR 39f713d0 z obnovené zálohy (obnova 019a1b2c-0000-7000-8000-000000000001)"),
                entry(ADMIN, ReceiptSigningKeyWithdrawal.ACTION, "Zneplatněn klíč k ověřovacím QR 39f713d0 (ověřeno druhým faktorem)"),
                entry(ADMIN, ReceiptSigningKeyWithdrawal.ACTION, "Stažen klíč k ověřovacím QR dac073e0 (ověřeno druhým faktorem)")), Set.of());

        assertThat(history.unreadable()).isEmpty();
        assertThat(history.recorded()).extracting(ReceiptSigningKeyId::value).containsExactlyInAnyOrder("21fe31df", "39f713d0", "dac073e0");
        assertThat(history.withdrawn()).extracting(ReceiptSigningKeyId::value).containsExactlyInAnyOrder("39f713d0", "dac073e0");
    }

    @Test
    @DisplayName("Given rows that agree with the trail, when they are checked, then nothing is out of place")
    void should_find_nothing_when_checked_given_rows_that_agree() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("21fe31df"), adopted("39f713d0"), withdrawn("39f713d0")), Set.of());

        assertThat(history.mismatches(List.of(active(OWN_PUBLIC_KEY), active(EARLIER_PUBLIC_KEY).withdrawn(content -> "seal")))).isEmpty();
    }

    @Test
    @DisplayName("Given a withdrawn key whose row is active again, when the rows are checked, then the key is reported as reverted")
    void should_report_reverted_when_checked_given_a_withdrawn_key_active_again() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("21fe31df"), withdrawn("21fe31df")), Set.of());

        assertThat(history.mismatches(List.of(active(OWN_PUBLIC_KEY))))
                .containsExactly(new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("21fe31df"), ReceiptSigningKeyMismatch.Kind.REVERTED));
    }

    @Test
    @DisplayName("Given keys the trail registered, adopted or withdrew whose rows are gone, when the rows are checked, then each is reported as missing, in id order")
    void should_report_missing_when_checked_given_recorded_keys_without_rows() {
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(List.of(registered("21fe31df"), adopted("39f713d0"), withdrawn("dac073e0")), Set.of());

        assertThat(history.mismatches(List.of())).containsExactly(
                new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("21fe31df"), ReceiptSigningKeyMismatch.Kind.MISSING),
                new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("39f713d0"), ReceiptSigningKeyMismatch.Kind.MISSING),
                new ReceiptSigningKeyMismatch(new ReceiptSigningKeyId("dac073e0"), ReceiptSigningKeyMismatch.Kind.MISSING));
    }

    @Test
    @DisplayName("Given a row the trail never names, when the rows are checked, then it is not reported, because the seal already judges rows")
    void should_not_report_when_checked_given_a_row_without_trail_entries() {
        assertThat(ReceiptSigningKeyHistory.of(List.of(), Set.of()).mismatches(List.of(active(OWN_PUBLIC_KEY)))).isEmpty();
    }
}
