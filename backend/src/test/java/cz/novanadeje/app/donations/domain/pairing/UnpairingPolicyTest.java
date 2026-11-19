package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationHasReceipt;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ErasedDonorUnpairingInBrowserOnly;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkHasReceipt;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimHasReceipt;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawal;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawalInBrowserOnly;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawalReason;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.acme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.frozen;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.singleDocument;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyDocument;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UnpairingPolicyTest {

    private static final Instant RECORDED = Instant.parse("2026-11-05T10:00:00Z");
    private static final SymbolClaimId CLAIM = SymbolClaimId.newId(NOW);
    private static final SenderAccountLinkId LINK = SenderAccountLinkId.newId(NOW);

    private final DonorRecord janaRecord = jana();
    private final Donation gift = giftOfJana(LocalDate.of(2026, 11, 5), RECORDED);
    private final Donation otherGift = giftOfJana(LocalDate.of(2026, 6, 1), RECORDED);

    @Nested
    @DisplayName("Given an administrator unpairs one gift")
    class ManualUnpairing {

        @Test
        @DisplayName("when no receipt covers the gift, then it may be unpaired and nothing is withdrawn")
        void should_withdraw_nothing_when_unpaired_given_no_receipt() {
            assertThat(new UnpairingPolicy(JANA, List.of()).decideUnpairing(gift, false, false)).isEmpty();
        }

        @Test
        @DisplayName("when a single receipt was issued for the gift, then it is refused")
        void should_refuse_when_unpaired_given_single_receipt() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(singleReceiptFor(gift, ReceiptStatus.ACTIVE)));

            assertThatThrownBy(() -> policy.decideUnpairing(gift, false, false)).isInstanceOf(DonationHasReceipt.class);
        }

        @Test
        @DisplayName("when the gift's single receipt was since replaced, then it is still refused")
        void should_refuse_when_unpaired_given_replaced_single_receipt() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(singleReceiptFor(gift, ReceiptStatus.REPLACED)));

            assertThatThrownBy(() -> policy.decideUnpairing(gift, false, false)).isInstanceOf(DonationHasReceipt.class);
        }

        @Test
        @DisplayName("when another gift has a single receipt, then the gift may be unpaired")
        void should_withdraw_nothing_when_unpaired_given_single_receipt_of_another_gift() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(singleReceiptFor(otherGift, ReceiptStatus.ACTIVE)));

            assertThat(policy.decideUnpairing(gift, false, false)).isEmpty();
        }

        @Test
        @DisplayName("when the donor's active yearly receipt lists the gift, then that receipt is to be withdrawn")
        void should_withdraw_yearly_when_unpaired_given_active_yearly_listing_the_gift() {
            DonationReceipt yearly = yearlyReceiptListing(List.of(gift, otherGift), NOW, ReceiptStatus.ACTIVE);

            assertThat(new UnpairingPolicy(JANA, List.of(yearly)).decideUnpairing(gift, false, false)).contains(yearly);
        }

        @Test
        @DisplayName("when the donor's active yearly receipt does not list the gift, then nothing is withdrawn")
        void should_withdraw_nothing_when_unpaired_given_active_yearly_without_the_gift() {
            DonationReceipt yearly = yearlyReceiptListing(List.of(otherGift), NOW, ReceiptStatus.ACTIVE);

            assertThat(new UnpairingPolicy(JANA, List.of(yearly)).decideUnpairing(gift, false, false)).isEmpty();
        }

        @Test
        @DisplayName("when only a withdrawn yearly receipt lists the gift, then nothing is withdrawn again")
        void should_withdraw_nothing_when_unpaired_given_withdrawn_yearly_listing_the_gift() {
            DonationReceipt yearly = yearlyReceiptListing(List.of(gift), NOW, ReceiptStatus.WITHDRAWN);

            assertThat(new UnpairingPolicy(JANA, List.of(yearly)).decideUnpairing(gift, false, false)).isEmpty();
        }

        @Test
        @DisplayName("when a connected application unpairs a gift with a single receipt that the active yearly receipt lists too, then the single receipt refuses it before the withdrawal does")
        void should_refuse_for_single_receipt_when_connected_application_unpairs_given_single_and_active_yearly_receipt() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(singleReceiptFor(gift, ReceiptStatus.REPLACED),
                    yearlyReceiptListing(List.of(gift), NOW, ReceiptStatus.ACTIVE)));

            assertThatThrownBy(() -> policy.decideUnpairing(gift, false, true)).isInstanceOf(DonationHasReceipt.class);
        }

        @Test
        @DisplayName("when only a replaced yearly receipt lists the gift, then nothing is withdrawn")
        void should_withdraw_nothing_when_unpaired_given_replaced_yearly_listing_the_gift() {
            DonationReceipt yearly = yearlyReceiptListing(List.of(gift), NOW, ReceiptStatus.REPLACED);

            assertThat(new UnpairingPolicy(JANA, List.of(yearly)).decideUnpairing(gift, false, false)).isEmpty();
        }

        @Test
        @DisplayName("when the gift has a single receipt and the active yearly receipt lists it too, then it is refused")
        void should_refuse_when_unpaired_given_single_receipt_and_active_yearly_listing_the_gift() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(singleReceiptFor(gift, ReceiptStatus.REPLACED),
                    yearlyReceiptListing(List.of(gift), NOW, ReceiptStatus.ACTIVE)));

            assertThatThrownBy(() -> policy.decideUnpairing(gift, false, false)).isInstanceOf(DonationHasReceipt.class);
        }

        @Test
        @DisplayName("when a connected application unpairs a gift the active yearly receipt lists, then the withdrawal is refused as browser-only")
        void should_refuse_withdrawal_when_connected_application_unpairs_given_active_yearly_listing_the_gift() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(yearlyReceiptListing(List.of(gift), NOW, ReceiptStatus.ACTIVE)));

            assertThatThrownBy(() -> policy.decideUnpairing(gift, false, true)).isInstanceOf(ReceiptWithdrawalInBrowserOnly.class);
        }

        @Test
        @DisplayName("when a connected application unpairs a gift no active yearly receipt lists, then it may be unpaired")
        void should_withdraw_nothing_when_connected_application_unpairs_given_no_covering_receipt() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(yearlyReceiptListing(List.of(otherGift), NOW, ReceiptStatus.ACTIVE)));

            assertThat(policy.decideUnpairing(gift, false, true)).isEmpty();
        }

        @Test
        @DisplayName("when a connected application unpairs a gift of an erased donor, then it is refused as browser-only even though a single receipt exists")
        void should_refuse_when_connected_application_unpairs_given_erased_donor() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(singleReceiptFor(gift, ReceiptStatus.ACTIVE)));

            assertThatThrownBy(() -> policy.decideUnpairing(gift, true, true)).isInstanceOf(ErasedDonorUnpairingInBrowserOnly.class);
        }

        @Test
        @DisplayName("when the browser unpairs a gift of an erased donor, then it may be unpaired as for any donor")
        void should_withdraw_nothing_when_browser_unpairs_given_erased_donor() {
            assertThat(new UnpairingPolicy(JANA, List.of()).decideUnpairing(gift, true, false)).isEmpty();
        }
    }

    @Nested
    @DisplayName("Given an administrator reverses a symbol claim or removes a sender account link")
    class LosingPairingSources {

        @Test
        @DisplayName("when no receipt covers the paired gifts, then both are allowed")
        void should_allow_when_reversed_or_removed_given_no_receipt() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(singleReceiptFor(otherGift, ReceiptStatus.ACTIVE)));

            assertThatCode(() -> policy.requireReversible(CLAIM, List.of(gift))).doesNotThrowAnyException();
            assertThatCode(() -> policy.requireRemovable(LINK, List.of(gift))).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("when no gift is paired through it, then both are allowed whatever receipts exist")
        void should_allow_when_reversed_or_removed_given_no_gift() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(yearlyReceiptListing(List.of(gift), NOW, ReceiptStatus.ACTIVE)));

            assertThatCode(() -> policy.requireReversible(CLAIM, List.of())).doesNotThrowAnyException();
            assertThatCode(() -> policy.requireRemovable(LINK, List.of())).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("when a single receipt of any status was issued for a paired gift, then both are refused")
        void should_refuse_when_reversed_or_removed_given_single_receipt() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(singleReceiptFor(gift, ReceiptStatus.REPLACED)));

            assertThatThrownBy(() -> policy.requireReversible(CLAIM, List.of(otherGift, gift))).isInstanceOf(SymbolClaimHasReceipt.class);
            assertThatThrownBy(() -> policy.requireRemovable(LINK, List.of(otherGift, gift))).isInstanceOf(SenderAccountLinkHasReceipt.class);
        }

        @Test
        @DisplayName("when a yearly receipt of the gift's year was issued at the moment the gift was recorded, then both are refused instead of withdrawing it")
        void should_refuse_when_reversed_or_removed_given_yearly_issued_when_gift_was_recorded() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(yearlyReceiptListing(List.of(otherGift), RECORDED, ReceiptStatus.ACTIVE)));

            assertThatThrownBy(() -> policy.requireReversible(CLAIM, List.of(gift))).isInstanceOf(SymbolClaimHasReceipt.class);
            assertThatThrownBy(() -> policy.requireRemovable(LINK, List.of(gift))).isInstanceOf(SenderAccountLinkHasReceipt.class);
        }

        @Test
        @DisplayName("when a withdrawn yearly receipt of the gift's year was issued after the gift was recorded, then both are refused")
        void should_refuse_when_reversed_or_removed_given_withdrawn_yearly_issued_since() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(yearlyReceiptListing(List.of(otherGift), NOW, ReceiptStatus.WITHDRAWN)));

            assertThatThrownBy(() -> policy.requireReversible(CLAIM, List.of(gift))).isInstanceOf(SymbolClaimHasReceipt.class);
            assertThatThrownBy(() -> policy.requireRemovable(LINK, List.of(gift))).isInstanceOf(SenderAccountLinkHasReceipt.class);
        }

        @Test
        @DisplayName("when the yearly receipt of the gift's year was issued before the gift was recorded, then both are allowed")
        void should_allow_when_reversed_or_removed_given_yearly_issued_before_the_gift() {
            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(yearlyReceiptListing(List.of(otherGift), RECORDED.minusMillis(1), ReceiptStatus.ACTIVE)));

            assertThatCode(() -> policy.requireReversible(CLAIM, List.of(gift))).doesNotThrowAnyException();
            assertThatCode(() -> policy.requireRemovable(LINK, List.of(gift))).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("when only a yearly receipt of another year was issued since, then both are allowed")
        void should_allow_when_reversed_or_removed_given_yearly_of_another_year() {
            Donation giftOf2025 = giftOfJana(LocalDate.of(2025, 11, 5), RECORDED);

            UnpairingPolicy policy = new UnpairingPolicy(JANA, List.of(yearlyReceiptListing(List.of(otherGift), NOW, ReceiptStatus.ACTIVE)));

            assertThatCode(() -> policy.requireReversible(CLAIM, List.of(giftOf2025))).doesNotThrowAnyException();
            assertThatCode(() -> policy.requireRemovable(LINK, List.of(giftOf2025))).doesNotThrowAnyException();
        }
    }

    @Test
    @DisplayName("Given no donor or no list of receipts, when the policy is made, then it is refused")
    void should_refuse_when_made_given_no_receipts() {
        assertThatThrownBy(() -> new UnpairingPolicy(JANA, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new UnpairingPolicy(null, List.of())).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given another donor's receipt or donation, when the policy is made or asked, then it is refused as a broken call")
    void should_refuse_when_made_or_asked_given_another_donors_receipt_or_donation() {
        DonationReceipt foreign = DonationReceipt.issue(DonationReceiptId.newId(NOW), acme().id(), NOW, new ReceiptFingerprint("6".repeat(64)),
                frozen(yearlyDocument(janaRecord, List.of(gift))), Optional.empty());
        UnpairingPolicy policy = new UnpairingPolicy(acme().id(), List.of());

        assertThatThrownBy(() -> new UnpairingPolicy(JANA, List.of(foreign))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> policy.decideUnpairing(gift, false, false)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> policy.requireReversible(CLAIM, List.of(gift))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> policy.requireRemovable(LINK, List.of(gift))).isInstanceOf(IllegalStateException.class);
    }

    private static Donation giftOfJana(LocalDate receivedOn, Instant recordedAt) {
        return Donation.reconstitute(DonationId.newId(recordedAt), JANA, Optional.of(BankPaymentId.newId(recordedAt)), receivedOn, Money.czk(50000),
                DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.of(PairingMethod.VARIABLE_SYMBOL), Optional.empty(), Optional.empty(),
                DonationPurpose.GENERAL, recordedAt);
    }

    private DonationReceipt singleReceiptFor(Donation donation, ReceiptStatus status) {
        return receipt(frozen(singleDocument(janaRecord, donation)), NOW, status);
    }

    private DonationReceipt yearlyReceiptListing(List<Donation> donations, Instant issuedAt, ReceiptStatus status) {
        return receipt(frozen(yearlyDocument(janaRecord, donations)), issuedAt, status);
    }

    private static DonationReceipt receipt(FrozenReceipt frozen, Instant issuedAt, ReceiptStatus status) {
        Optional<Instant> supersededAt = status == ReceiptStatus.REPLACED ? Optional.of(issuedAt) : Optional.empty();
        Optional<ReceiptWithdrawal> withdrawal = status == ReceiptStatus.WITHDRAWN
                ? Optional.of(new ReceiptWithdrawal(issuedAt, ReceiptWithdrawalReason.DONATIONS_CHANGED)) : Optional.empty();
        return DonationReceipt.reconstitute(DonationReceiptId.newId(issuedAt), JANA, issuedAt, new ReceiptFingerprint("5".repeat(64)), frozen,
                Optional.empty(), status, supersededAt, withdrawal);
    }
}
