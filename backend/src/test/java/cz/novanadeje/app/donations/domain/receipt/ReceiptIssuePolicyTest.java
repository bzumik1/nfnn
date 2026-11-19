package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.receipt.ReceiptIssueFacts.ForGift;
import cz.novanadeje.app.donations.domain.receipt.ReceiptIssueFacts.ForYear;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.frozen;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.singleDocument;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyDocument;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReceiptIssuePolicyTest {

    private static final ReceiptFingerprint REQUESTED = new ReceiptFingerprint("a".repeat(64));
    private static final ReceiptFingerprint EARLIER = new ReceiptFingerprint("b".repeat(64));

    private final Donation march = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private final Donation june = receivedFromJana(LocalDate.of(2026, 6, 15), 30000);

    @Nested
    @DisplayName("Given a single receipt is requested for a gift")
    class ForAGift {

        @Test
        @DisplayName("when the gift has no receipt yet, then nothing is returned again and a first receipt replaces and supersedes nothing")
        void should_issue_first_receipt_when_decided_given_no_receipt() {
            ForGift facts = new ForGift(march.id(), Optional.empty(), REQUESTED, Optional.empty());

            assertThat(ReceiptIssuePolicy.activeToReturnAgain(facts)).isEmpty();
            assertThat(ReceiptIssuePolicy.newReceipt(facts, List.of(), Optional.empty(), false)).isEqualTo(new NewReceipt(Optional.empty(), List.of()));
        }

        @Test
        @DisplayName("when the active single receipt certifies the same data, then it is returned again")
        void should_return_active_again_when_decided_given_same_data() {
            DonationReceipt active = single(march, REQUESTED);

            assertThat(ReceiptIssuePolicy.activeToReturnAgain(new ForGift(march.id(), Optional.empty(), REQUESTED, Optional.of(active)))).contains(active);
        }

        @Test
        @DisplayName("when the active single receipt certifies other data, then a new one replaces and supersedes it")
        void should_replace_active_when_decided_given_changed_data() {
            DonationReceipt active = single(march, EARLIER);
            ForGift facts = new ForGift(march.id(), Optional.empty(), REQUESTED, Optional.of(active));

            assertThat(ReceiptIssuePolicy.activeToReturnAgain(facts)).isEmpty();
            assertThat(ReceiptIssuePolicy.newReceipt(facts, List.of(), Optional.empty(), false)).isEqualTo(new NewReceipt(Optional.of(active), List.of(active)));
        }

        @Test
        @DisplayName("when the active yearly receipt of the gift's year lists it, then it is refused even though the single receipt certifies the same data")
        void should_refuse_when_decided_given_active_yearly_listing_the_gift() {
            ForGift facts = new ForGift(march.id(), Optional.of(yearly(List.of(march, june), EARLIER)), REQUESTED, Optional.of(single(march, REQUESTED)));

            assertThatThrownBy(() -> ReceiptIssuePolicy.activeToReturnAgain(facts)).isInstanceOf(DonationOnYearlyReceipt.class);
        }

        @Test
        @DisplayName("when the active yearly receipt of the gift's year does not list it, then the first receipt is issued")
        void should_issue_when_decided_given_active_yearly_without_the_gift() {
            ForGift facts = new ForGift(march.id(), Optional.of(yearly(List.of(june), EARLIER)), REQUESTED, Optional.empty());

            assertThat(ReceiptIssuePolicy.activeToReturnAgain(facts)).isEmpty();
            assertThat(ReceiptIssuePolicy.newReceipt(facts, List.of(), Optional.empty(), false)).isEqualTo(new NewReceipt(Optional.empty(), List.of()));
        }

        @Test
        @DisplayName("when a connected application asks for changed data, then the replacement is refused as browser-only")
        void should_refuse_replacement_when_connected_application_decides_given_changed_data() {
            ForGift facts = new ForGift(march.id(), Optional.empty(), REQUESTED, Optional.of(single(march, EARLIER)));

            assertThatThrownBy(() -> ReceiptIssuePolicy.newReceipt(facts, List.of(), Optional.empty(), true)).isInstanceOf(ReceiptReplacementInBrowserOnly.class);
        }

        @Test
        @DisplayName("when a connected application asks for the gift's first receipt, then it is issued")
        void should_issue_first_receipt_when_connected_application_decides_given_no_receipt() {
            ForGift facts = new ForGift(march.id(), Optional.empty(), REQUESTED, Optional.empty());

            assertThat(ReceiptIssuePolicy.newReceipt(facts, List.of(), Optional.empty(), true)).isEqualTo(new NewReceipt(Optional.empty(), List.of()));
        }

        @Test
        @DisplayName("when single receipts or an outdated yearly receipt are handed in, then it is refused as a broken call")
        void should_refuse_when_decided_given_singles_or_outdated_for_a_gift() {
            ForGift facts = new ForGift(march.id(), Optional.empty(), REQUESTED, Optional.empty());

            assertThatThrownBy(() -> ReceiptIssuePolicy.newReceipt(facts, List.of(single(june, EARLIER)), Optional.empty(), false))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> ReceiptIssuePolicy.newReceipt(facts, List.of(), Optional.of(yearly(List.of(june), EARLIER)), false))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("Given a yearly receipt is requested for a year")
    class ForAYear {

        @Test
        @DisplayName("when the year has no receipt yet, then a first receipt supersedes the active single receipts of its gifts")
        void should_issue_first_superseding_singles_when_decided_given_active_singles() {
            DonationReceipt marchSingle = single(march, EARLIER);
            DonationReceipt juneSingle = single(june, EARLIER);
            ForYear facts = new ForYear(REQUESTED, Optional.empty());

            assertThat(ReceiptIssuePolicy.activeToReturnAgain(facts)).isEmpty();
            assertThat(ReceiptIssuePolicy.newReceipt(facts, List.of(marchSingle, juneSingle), Optional.empty(), false))
                    .isEqualTo(new NewReceipt(Optional.empty(), List.of(marchSingle, juneSingle)));
        }

        @Test
        @DisplayName("when the active yearly receipt certifies the same data, then it is returned again")
        void should_return_active_again_when_decided_given_same_data() {
            DonationReceipt active = yearly(List.of(march), REQUESTED);

            assertThat(ReceiptIssuePolicy.activeToReturnAgain(new ForYear(REQUESTED, Optional.of(active)))).contains(active);
        }

        @Test
        @DisplayName("when the active yearly receipt certifies other data, then a new one replaces it rather than an outdated one and supersedes it first, then the single receipts")
        void should_replace_active_and_supersede_singles_when_decided_given_changed_data() {
            DonationReceipt active = yearly(List.of(march), EARLIER);
            DonationReceipt juneSingle = single(june, EARLIER);
            ForYear facts = new ForYear(REQUESTED, Optional.of(active));

            assertThat(ReceiptIssuePolicy.activeToReturnAgain(facts)).isEmpty();
            assertThat(ReceiptIssuePolicy.newReceipt(facts, List.of(juneSingle), Optional.of(yearly(List.of(march), EARLIER)), false))
                    .isEqualTo(new NewReceipt(Optional.of(active), List.of(active, juneSingle)));
        }

        @Test
        @DisplayName("when only an outdated yearly receipt of the year exists, then the new one names it as replaced and supersedes nothing")
        void should_name_outdated_when_decided_given_withdrawn_yearly() {
            DonationReceipt outdated = yearly(List.of(march), EARLIER);

            assertThat(ReceiptIssuePolicy.newReceipt(new ForYear(REQUESTED, Optional.empty()), List.of(), Optional.of(outdated), false))
                    .isEqualTo(new NewReceipt(Optional.of(outdated), List.of()));
        }

        @Test
        @DisplayName("when a connected application asks after a withdrawal, then the new receipt is issued, since it replaces nothing valid")
        void should_issue_when_connected_application_decides_given_only_outdated_yearly() {
            DonationReceipt outdated = yearly(List.of(march), EARLIER);

            assertThat(ReceiptIssuePolicy.newReceipt(new ForYear(REQUESTED, Optional.empty()), List.of(), Optional.of(outdated), true))
                    .isEqualTo(new NewReceipt(Optional.of(outdated), List.of()));
        }

        @Test
        @DisplayName("when a connected application asks for changed data, then the replacement is refused as browser-only")
        void should_refuse_replacement_when_connected_application_decides_given_changed_yearly() {
            ForYear facts = new ForYear(REQUESTED, Optional.of(yearly(List.of(march), EARLIER)));

            assertThatThrownBy(() -> ReceiptIssuePolicy.newReceipt(facts, List.of(), Optional.empty(), true)).isInstanceOf(ReceiptReplacementInBrowserOnly.class);
        }

        @Test
        @DisplayName("when a connected application asks for the first yearly receipt of a year with an active single receipt, then it is refused as browser-only")
        void should_refuse_when_connected_application_decides_given_active_single() {
            ForYear facts = new ForYear(REQUESTED, Optional.empty());

            assertThatThrownBy(() -> ReceiptIssuePolicy.newReceipt(facts, List.of(single(june, EARLIER)), Optional.empty(), true))
                    .isInstanceOf(ReceiptReplacementInBrowserOnly.class);
        }

        @Test
        @DisplayName("when a connected application asks for the first yearly receipt of a year without receipts, then it is issued")
        void should_issue_when_connected_application_decides_given_no_receipt() {
            assertThat(ReceiptIssuePolicy.newReceipt(new ForYear(REQUESTED, Optional.empty()), List.of(), Optional.empty(), true))
                    .isEqualTo(new NewReceipt(Optional.empty(), List.of()));
        }
    }

    @Test
    @DisplayName("Given an active receipt that certifies the requested data, when a new receipt is asked for, then it is refused as a broken call")
    void should_refuse_new_receipt_when_asked_given_active_receipt_certifying_the_data() {
        ForYear facts = new ForYear(REQUESTED, Optional.of(yearly(List.of(march), REQUESTED)));

        assertThatThrownBy(() -> ReceiptIssuePolicy.newReceipt(facts, List.of(), Optional.empty(), false)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("Given facts with a missing value, when they are made, then they are refused")
    void should_refuse_when_made_given_missing_values() {
        assertThatThrownBy(() -> new ForGift(march.id(), Optional.empty(), null, Optional.empty())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ForYear(REQUESTED, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new NewReceipt(Optional.empty(), null)).isInstanceOf(IllegalArgumentException.class);
    }

    private DonationReceipt single(Donation donation, ReceiptFingerprint fingerprint) {
        return DonationReceipt.issue(DonationReceiptId.newId(NOW), JANA, NOW, fingerprint, frozen(singleDocument(jana(), donation)), Optional.empty());
    }

    private DonationReceipt yearly(List<Donation> donations, ReceiptFingerprint fingerprint) {
        return DonationReceipt.issue(DonationReceiptId.newId(NOW), JANA, NOW, fingerprint, frozen(yearlyDocument(jana(), donations)), Optional.empty());
    }
}
