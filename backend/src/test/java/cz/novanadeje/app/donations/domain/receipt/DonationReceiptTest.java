package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.frozen;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.janaSpeakingEnglish;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.singleDocument;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyDocument;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class DonationReceiptTest {

    private static final DonationReceiptId ID = DonationReceiptId.newId(NOW);
    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final ReceiptFingerprint FINGERPRINT = new ReceiptFingerprint("a".repeat(64));
    private static final ReceiptFingerprint OTHER_FINGERPRINT = new ReceiptFingerprint("b".repeat(64));
    private static final Donation APRIL = receivedFromJana(LocalDate.of(2026, 4, 2), 20000);
    private static final ReceiptWithdrawal CHANGED_DONATIONS = new ReceiptWithdrawal(NOW.plusSeconds(60), ReceiptWithdrawalReason.DONATIONS_CHANGED);

    @Test
    @DisplayName("Given the frozen receipt of a donation, when it is issued, then it is an active single receipt of that donation, with the number, issue day and locale frozen")
    void should_be_active_single_receipt_when_issued_given_frozen_receipt_of_donation() {
        FrozenReceipt frozen = frozen(singleDocument(jana(), MARCH));

        DonationReceipt receipt = DonationReceipt.issue(ID, JANA, NOW, FINGERPRINT, frozen, Optional.empty());

        assertThat(receipt.id()).isEqualTo(ID);
        assertThat(receipt.donor()).isEqualTo(JANA);
        assertThat(receipt.kind()).isEqualTo(ReceiptKind.SINGLE);
        assertThat(receipt.donation()).contains(MARCH.id());
        assertThat(receipt.year()).isEmpty();
        assertThat(receipt.number()).isEqualTo(FIRST_NUMBER);
        assertThat(receipt.issuedOn()).isEqualTo(TODAY);
        assertThat(receipt.issuedAt()).isEqualTo(NOW);
        assertThat(receipt.locale()).isEqualTo(LocaleCode.CS);
        assertThat(receipt.fingerprint()).isEqualTo(FINGERPRINT);
        assertThat(receipt.frozen()).isEqualTo(frozen);
        assertThat(receipt.supersedes()).isEmpty();
        assertThat(receipt.status()).isEqualTo(ReceiptStatus.ACTIVE);
        assertThat(receipt.supersededAt()).isEmpty();
        assertThat(receipt.isActive()).isTrue();
        assertThat(receipt.withdrawal()).isEmpty();
        assertThat(receipt.standing()).isEqualTo(ReceiptStanding.ACTIVE);
    }

    @Test
    @DisplayName("Given the frozen receipt of a year, when it is issued as a replacement, then it is a yearly receipt of that year naming the replaced one")
    void should_be_yearly_replacement_when_issued_given_frozen_yearly_receipt_and_replaced_receipt() {
        DonationReceiptId replaced = DonationReceiptId.newId(NOW.minusSeconds(60));

        DonationReceipt receipt = DonationReceipt.issue(ID, JANA, NOW, FINGERPRINT,
                frozen(yearlyDocument(janaSpeakingEnglish(), List.of(MARCH))), Optional.of(replaced));

        assertThat(receipt.kind()).isEqualTo(ReceiptKind.YEARLY);
        assertThat(receipt.year()).contains(YEAR_2026);
        assertThat(receipt.donation()).isEmpty();
        assertThat(receipt.supersedes()).contains(replaced);
        assertThat(receipt.locale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given a missing part, or a supersede time or a withdrawal that does not match the status, when a receipt is issued or reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_missing_part_or_supersede_time_or_withdrawal_not_matching_status() {
        FrozenReceipt frozen = frozen(singleDocument(jana(), MARCH));

        assertThatIllegalArgumentException().isThrownBy(() -> DonationReceipt.issue(ID, JANA, NOW, FINGERPRINT, null, Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> DonationReceipt.reconstitute(ID, JANA, NOW, FINGERPRINT, frozen, Optional.empty(),
                ReceiptStatus.REPLACED, Optional.empty(), Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> DonationReceipt.reconstitute(ID, JANA, NOW, FINGERPRINT, frozen, Optional.empty(),
                ReceiptStatus.ACTIVE, Optional.of(NOW), Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> DonationReceipt.reconstitute(ID, JANA, NOW, FINGERPRINT, frozen, Optional.empty(),
                null, Optional.empty(), Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> DonationReceipt.reconstitute(ID, JANA, NOW, FINGERPRINT, frozen, Optional.empty(),
                ReceiptStatus.ACTIVE, Optional.empty(), Optional.of(CHANGED_DONATIONS)));
        assertThat(DonationReceipt.reconstitute(ID, JANA, NOW, FINGERPRINT, frozen, Optional.empty(), ReceiptStatus.WITHDRAWN, Optional.empty(),
                Optional.empty()).isActive()).isFalse();
    }

    @Test
    @DisplayName("Given an active receipt, when it is superseded, then it is replaced, no longer active and remembers when")
    void should_be_replaced_when_superseded_given_active_receipt() {
        DonationReceipt receipt = single();
        Instant later = NOW.plusSeconds(3600);

        receipt.markSuperseded(later);

        assertThat(receipt.status()).isEqualTo(ReceiptStatus.REPLACED);
        assertThat(receipt.isActive()).isFalse();
        assertThat(receipt.supersededAt()).contains(later);
    }

    @Test
    @DisplayName("Given a replaced or a withdrawn receipt, when it is superseded, then it is refused")
    void should_refuse_when_superseded_given_receipt_that_is_not_active() {
        DonationReceipt replaced = single();
        replaced.markSuperseded(NOW.plusSeconds(60));
        DonationReceipt withdrawn = DonationReceipt.reconstitute(ID, JANA, NOW, FINGERPRINT, frozen(singleDocument(jana(), MARCH)),
                Optional.empty(), ReceiptStatus.WITHDRAWN, Optional.empty(), Optional.empty());

        assertThatIllegalStateException().isThrownBy(() -> replaced.markSuperseded(NOW.plusSeconds(120)));
        assertThatIllegalStateException().isThrownBy(() -> withdrawn.markSuperseded(NOW.plusSeconds(120)));
    }

    @Test
    @DisplayName("Given a receipt, when a fingerprint is compared, then it certifies only the data it was issued for")
    void should_certify_only_own_fingerprint_when_compared_given_receipt() {
        DonationReceipt receipt = single();

        assertThat(receipt.certifies(new ReceiptFingerprint("a".repeat(64)))).isTrue();
        assertThat(receipt.certifies(OTHER_FINGERPRINT)).isFalse();
    }

    @Test
    @DisplayName("Given an active yearly receipt, when it is withdrawn because the donor's donations changed, then it is withdrawn, no longer active, remembers when and why, and stands as outdated")
    void should_be_outdated_when_withdrawn_because_donations_changed_given_active_yearly_receipt() {
        DonationReceipt receipt = yearly();
        Instant later = NOW.plusSeconds(3600);

        receipt.withdrawBecauseDonationsChanged(later);

        assertThat(receipt.status()).isEqualTo(ReceiptStatus.WITHDRAWN);
        assertThat(receipt.isActive()).isFalse();
        assertThat(receipt.supersededAt()).isEmpty();
        assertThat(receipt.withdrawal()).contains(new ReceiptWithdrawal(later, ReceiptWithdrawalReason.DONATIONS_CHANGED));
        assertThat(receipt.standing()).isEqualTo(ReceiptStanding.OUTDATED);
    }

    @Test
    @DisplayName("Given a replaced or an already withdrawn receipt, when it is withdrawn, then it is refused")
    void should_refuse_when_withdrawn_given_receipt_that_is_not_active() {
        DonationReceipt replaced = yearly();
        replaced.markSuperseded(NOW.plusSeconds(60));
        DonationReceipt withdrawn = yearly();
        withdrawn.withdrawBecauseDonationsChanged(NOW.plusSeconds(60));

        assertThatIllegalStateException().isThrownBy(() -> replaced.withdrawBecauseDonationsChanged(NOW.plusSeconds(120)));
        assertThatIllegalStateException().isThrownBy(() -> withdrawn.withdrawBecauseDonationsChanged(NOW.plusSeconds(120)));
        assertThatIllegalStateException().isThrownBy(() -> withdrawn.markSuperseded(NOW.plusSeconds(120)));
    }

    @Test
    @DisplayName("Given an active single receipt, when it is withdrawn because the donations changed, then it is refused and stays active")
    void should_refuse_when_withdrawn_because_donations_changed_given_single_receipt() {
        DonationReceipt receipt = single();

        assertThatIllegalStateException().isThrownBy(() -> receipt.withdrawBecauseDonationsChanged(NOW.plusSeconds(60)));

        assertThat(receipt.isActive()).isTrue();
        assertThat(receipt.withdrawal()).isEmpty();
    }

    @Test
    @DisplayName("Given a yearly receipt, when asked whether it lists a donation, then it lists exactly the donations it certifies")
    void should_list_only_certified_donations_when_asked_given_yearly_receipt() {
        DonationReceipt receipt = yearly();

        assertThat(receipt.lists(MARCH.id())).isTrue();
        assertThat(receipt.lists(APRIL.id())).isFalse();
    }

    @Test
    @DisplayName("Given each kept status and withdrawal, when the standing is read, then a withdrawal because the donations changed is outdated and any other withdrawal is withdrawn")
    void should_tell_outdated_from_withdrawn_when_standing_read_given_status_and_withdrawal() {
        assertThat(ReceiptStanding.of(ReceiptStatus.ACTIVE, Optional.empty())).isEqualTo(ReceiptStanding.ACTIVE);
        assertThat(ReceiptStanding.of(ReceiptStatus.REPLACED, Optional.empty())).isEqualTo(ReceiptStanding.REPLACED);
        assertThat(ReceiptStanding.of(ReceiptStatus.WITHDRAWN, Optional.empty())).isEqualTo(ReceiptStanding.WITHDRAWN);
        assertThat(ReceiptStanding.of(ReceiptStatus.WITHDRAWN, Optional.of(ReceiptWithdrawalReason.DONATIONS_CHANGED)))
                .isEqualTo(ReceiptStanding.OUTDATED);
    }

    private static DonationReceipt yearly() {
        return DonationReceipt.issue(ID, JANA, NOW, FINGERPRINT, frozen(yearlyDocument(jana(), List.of(MARCH))), Optional.empty());
    }

    private static DonationReceipt single() {
        return DonationReceipt.issue(ID, JANA, NOW, FINGERPRINT, frozen(singleDocument(jana(), MARCH)), Optional.empty());
    }
}
