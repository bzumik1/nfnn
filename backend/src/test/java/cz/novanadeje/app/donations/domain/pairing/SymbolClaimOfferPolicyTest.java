package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static cz.novanadeje.app.donations.BankPayments.PAYER_NAME;
import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.shared.domain.Money.czk;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SymbolClaimOfferPolicyTest {

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 22);
    private static final LocalDate VERIFIED_ON = LocalDate.of(2026, 10, 16);
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final SenderAccount OTHER_ACCOUNT = new SenderAccount("1234567", "0800");
    private static final VariableSymbol JANA_SYMBOL = new VariableSymbol("4821937560");
    private static final VariableSymbol PETR_SYMBOL = new VariableSymbol("7310945528");
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");
    private static final VariableSymbol OTHER_OLD_SYMBOL = new VariableSymbol("5123456789");
    private static final DonorReference JANA = new DonorReference(UuidV7.generate(NOW));
    private static final DonorReference PETR = new DonorReference(UuidV7.generate(NOW));

    private final SymbolClaimOfferPolicy policy = new SymbolClaimOfferPolicy(ExcludedSenderAccounts.none());
    private final BankPayment january = gift(1, LocalDate.of(2025, 1, 15), "00" + OLD_SYMBOL.value());
    private final BankPayment september = gift(2, LocalDate.of(2026, 9, 15), OLD_SYMBOL.value());
    private final BankPayment verification = verification(3, VERIFIED_ON);
    private final SenderAccountLink link = provedLink(verification, Optional.empty());
    private final DonorRecord jana = janaWith(link);
    private final List<BankPayment> standingOrder = List.of(january, september, verification);

    @Test
    @DisplayName("Given a standing order with an old symbol and the 1 Kč payment that proved the link, when a candidate and an offer are sought, then the old symbol is offered with the count and months of its unpaired payments")
    void should_offer_old_symbol_when_sought_given_verification_payment_proved_link() {
        Optional<VariableSymbol> candidate = policy.candidate(jana, link, standingOrder, Set.of(verification.id()), List.of(jana), List.of(), TODAY);
        Optional<SymbolClaimOffer> offer = policy.offer(jana, ACCOUNT, OLD_SYMBOL, List.of(january, september), List.of(jana));

        assertThat(candidate).contains(OLD_SYMBOL);
        assertThat(offer).contains(new SymbolClaimOffer(ACCOUNT, OLD_SYMBOL, 2, YearMonth.of(2025, 1), YearMonth.of(2026, 9)));
    }

    @Test
    @DisplayName("Given a link learned from an ordinary gift and a 1 Kč verification payment sent later, when a candidate is sought, then the old symbol is the candidate")
    void should_propose_old_symbol_when_sought_given_verification_after_link_learned_from_gift() {
        BankPayment ownGift = gift(4, LocalDate.of(2026, 3, 1), JANA_SYMBOL.value());
        SenderAccountLink learned = provedLink(ownGift, Optional.empty());
        DonorRecord donor = janaWith(learned);

        Optional<VariableSymbol> candidate = policy.candidate(donor, learned, List.of(january, ownGift, september, verification),
                Set.of(verification.id()), List.of(donor), List.of(), TODAY);

        assertThat(candidate).contains(OLD_SYMBOL);
    }

    @Test
    @DisplayName("Given an ordinary gift, a 1 Kč without the message and a 1 Kč without a symbol, none of them a verification payment of the donor, when a candidate is sought, then there is none")
    void should_propose_nothing_when_sought_given_no_verification_payment() {
        BankPayment ownGift = gift(4, LocalDate.of(2026, 3, 1), JANA_SYMBOL.value());
        BankPayment withoutMessage = payment(5, VERIFIED_ON, czk(100), Optional.of(ACCOUNT), JANA_SYMBOL.value());
        BankPayment withoutSymbol = payment(6, VERIFIED_ON, czk(100), Optional.of(ACCOUNT), null, "OVERENI UCTU");
        SenderAccountLink learned = provedLink(ownGift, Optional.empty());
        DonorRecord donor = janaWith(learned);

        Optional<VariableSymbol> candidate = policy.candidate(donor, learned, List.of(january, ownGift, september, withoutMessage, withoutSymbol),
                Set.of(), List.of(donor), List.of(), TODAY);

        assertThat(candidate).isEmpty();
    }

    @Test
    @DisplayName("Given the donor's verification payment from another account among the payments, when a candidate is sought for this account, then there is none")
    void should_propose_nothing_when_sought_given_verification_from_another_account() {
        BankPayment ownGift = gift(4, LocalDate.of(2026, 3, 1), JANA_SYMBOL.value());
        BankPayment foreign = payment(5, VERIFIED_ON, czk(100), Optional.of(OTHER_ACCOUNT), JANA_SYMBOL.value(), "OVERENI UCTU");
        SenderAccountLink learned = provedLink(ownGift, Optional.empty());
        DonorRecord donor = janaWith(learned);

        Optional<VariableSymbol> candidate = policy.candidate(donor, learned, List.of(january, ownGift, september, foreign),
                Set.of(foreign.id()), List.of(donor), List.of(), TODAY);

        assertThat(candidate).isEmpty();
    }

    @Test
    @DisplayName("Given a link awaiting a payment, a disconnected link or another donor's link, when a candidate is sought, then there is none")
    void should_propose_nothing_when_sought_given_link_not_live_active_and_own() {
        SenderAccountLink awaiting = SenderAccountLink.awaitingPayment(SenderAccountLinkId.newId(NOW), ACCOUNT, VERIFIED_ON.minusDays(1), NOW);
        SenderAccountLink disconnected = endedLink(verification, Optional.empty(), TODAY.minusDays(1));
        SenderAccountLink petrsLink = provedLink(gift(4, LocalDate.of(2026, 3, 1), PETR_SYMBOL.value()), Optional.empty());
        DonorRecord awaitingDonor = janaWith(awaiting);
        DonorRecord disconnectedDonor = janaWith(disconnected);
        DonorRecord petr = petrWith(petrsLink);

        assertThat(policy.candidate(awaitingDonor, awaiting, standingOrder, Set.of(verification.id()), List.of(awaitingDonor), List.of(), TODAY))
                .isEmpty();
        assertThat(policy.candidate(disconnectedDonor, disconnected, standingOrder, Set.of(verification.id()), List.of(disconnectedDonor),
                List.of(), TODAY)).isEmpty();
        assertThat(policy.candidate(jana, petrsLink, standingOrder, Set.of(verification.id()), List.of(jana, petr), List.of(), TODAY)).isEmpty();
    }

    @Test
    @DisplayName("Given two unknown symbols from the account before the verification day, when a candidate is sought, then there is none")
    void should_propose_nothing_when_sought_given_two_unknown_symbols_before_verification() {
        BankPayment other = gift(4, LocalDate.of(2025, 6, 15), OTHER_OLD_SYMBOL.value());

        Optional<VariableSymbol> candidate = policy.candidate(jana, link, List.of(january, other, september, verification),
                Set.of(verification.id()), List.of(jana), List.of(), TODAY);

        assertThat(candidate).isEmpty();
    }

    @Test
    @DisplayName("Given the donor answered the only symbol and an older payment with a second symbol arrived later, when a candidate is sought, then the second symbol is not offered either")
    void should_propose_nothing_when_sought_given_answered_symbol_and_second_symbol_appearing_later() {
        BankPayment olderHistory = gift(4, LocalDate.of(2024, 11, 15), OTHER_OLD_SYMBOL.value());

        Optional<VariableSymbol> candidate = policy.candidate(jana, link, List.of(olderHistory, january, september, verification),
                Set.of(verification.id()), List.of(jana), List.of(claim(JANA, OLD_SYMBOL, SymbolClaimAnswer.DECLINED)), TODAY);

        assertThat(candidate).isEmpty();
    }

    @Test
    @DisplayName("Given the donor already answered yes or no for the symbol, when a candidate is sought, then there is none")
    void should_propose_nothing_when_sought_given_donor_answered() {
        for (SymbolClaimAnswer answer : SymbolClaimAnswer.values()) {
            Optional<VariableSymbol> candidate = policy.candidate(jana, link, standingOrder, Set.of(verification.id()), List.of(jana),
                    List.of(claim(JANA, OLD_SYMBOL, answer)), TODAY);

            assertThat(candidate).isEmpty();
        }
    }

    @Test
    @DisplayName("Given a registered donor's symbol from the account before the verification day, paired to that grandson or not, when a candidate is sought, then there is none")
    void should_propose_nothing_when_sought_given_registered_symbol_before_verification() {
        BankPayment grandsonsGift = gift(4, LocalDate.of(2026, 5, 1), PETR_SYMBOL.value());
        DonorRecord grandson = petrWith(endedLink(grandsonsGift, Optional.empty(), LocalDate.of(2026, 10, 1)));
        List<BankPayment> payments = List.of(january, grandsonsGift, september, verification);

        assertThat(policy.candidate(jana, link, payments, Set.of(verification.id()), List.of(jana, grandson), List.of(), TODAY)).isEmpty();
        assertThat(policy.candidate(jana, link, payments, Set.of(verification.id()), List.of(jana), List.of(), TODAY)).isEmpty();
    }

    @Test
    @DisplayName("Given the donor took the account over with the 1 Kč on the day the other donor released it, when a candidate is sought, then the uncovered verification day leaves nothing to offer")
    void should_propose_nothing_when_sought_given_verification_on_take_over_day() {
        LocalDate released = LocalDate.of(2026, 10, 1);
        BankPayment proof = verification(4, released);
        DonorRecord previous = petrWith(endedLink(gift(5, LocalDate.of(2025, 2, 1), PETR_SYMBOL.value()), Optional.empty(), released));
        SenderAccountLink takenOver = provedLink(proof, Optional.of(released.plusDays(1)));
        DonorRecord donor = janaWith(takenOver);
        List<BankPayment> payments = List.of(gift(6, LocalDate.of(2026, 9, 15), OLD_SYMBOL.value()), proof,
                gift(7, LocalDate.of(2026, 10, 15), OLD_SYMBOL.value()));

        Optional<VariableSymbol> candidate = policy.candidate(donor, takenOver, payments, Set.of(proof.id()), List.of(previous, donor), List.of(), TODAY);

        assertThat(candidate).isEmpty();
    }

    @Test
    @DisplayName("Given an account the donor took over, when a candidate is sought, then payments booked before the take-over starts are ignored")
    void should_ignore_days_before_take_over_when_sought_given_taken_over_account() {
        LocalDate released = LocalDate.of(2026, 9, 30);
        DonorRecord previous = petrWith(endedLink(gift(4, LocalDate.of(2025, 2, 1), PETR_SYMBOL.value()), Optional.empty(), released));
        SenderAccountLink takenOver = provedLink(verification, Optional.of(released.plusDays(1)));
        DonorRecord donor = janaWith(takenOver);
        List<BankPayment> payments = List.of(gift(5, LocalDate.of(2026, 9, 15), OTHER_OLD_SYMBOL.value()),
                gift(6, LocalDate.of(2026, 10, 5), OLD_SYMBOL.value()), verification);

        Optional<VariableSymbol> candidate = policy.candidate(donor, takenOver, payments, Set.of(verification.id()), List.of(previous, donor),
                List.of(), TODAY);

        assertThat(candidate).contains(OLD_SYMBOL);
    }

    @Test
    @DisplayName("Given another donor's link covering today or another donor's active link starting tomorrow, when a candidate is sought, then there is none")
    void should_propose_nothing_when_sought_given_account_shared_now_or_from_tomorrow() {
        BankPayment petrsGift = gift(4, LocalDate.of(2026, 3, 1), PETR_SYMBOL.value());
        DonorRecord coveringToday = petrWith(provedLink(petrsGift, Optional.empty()));
        DonorRecord startingTomorrow = petrWith(provedLink(petrsGift, Optional.of(TODAY.plusDays(1))));

        assertThat(policy.candidate(jana, link, standingOrder, Set.of(verification.id()), List.of(jana, coveringToday), List.of(), TODAY))
                .isEmpty();
        assertThat(policy.candidate(jana, link, standingOrder, Set.of(verification.id()), List.of(jana, startingTomorrow), List.of(), TODAY))
                .isEmpty();
    }

    @Test
    @DisplayName("Given another donor's link that covered the account only until yesterday, when a candidate is sought, then it does not block the offer")
    void should_propose_old_symbol_when_sought_given_other_link_ended_yesterday() {
        DonorRecord previous = petrWith(endedLink(gift(4, LocalDate.of(2025, 2, 1), PETR_SYMBOL.value()), Optional.empty(), TODAY.minusDays(1)));
        BankPayment proof = verification(5, TODAY);
        SenderAccountLink takenOver = provedLink(proof, Optional.of(TODAY));
        DonorRecord donor = janaWith(takenOver);
        List<BankPayment> payments = List.of(gift(6, LocalDate.of(2026, 9, 15), OTHER_OLD_SYMBOL.value()), gift(7, TODAY, OLD_SYMBOL.value()), proof);

        Optional<VariableSymbol> candidate = policy.candidate(donor, takenOver, payments, Set.of(proof.id()), List.of(previous, donor), List.of(), TODAY);

        assertThat(candidate).contains(OLD_SYMBOL);
    }

    @Test
    @DisplayName("Given an account excluded from pairing, when a candidate and an offer are sought, then there is neither")
    void should_offer_nothing_when_sought_given_excluded_account() {
        SymbolClaimOfferPolicy excluding = new SymbolClaimOfferPolicy(new ExcludedSenderAccounts(Set.of(ACCOUNT)));

        assertThat(excluding.candidate(jana, link, standingOrder, Set.of(verification.id()), List.of(jana), List.of(), TODAY)).isEmpty();
        assertThat(excluding.offer(jana, ACCOUNT, OLD_SYMBOL, List.of(january, september), List.of(jana))).isEmpty();
    }

    @Test
    @DisplayName("Given another donor confirmed the symbol for the account, when a candidate is sought, then there is none, while another donor's no does not block")
    void should_propose_nothing_when_sought_given_symbol_confirmed_by_another_donor() {
        Optional<VariableSymbol> confirmedByPetr = policy.candidate(jana, link, standingOrder, Set.of(verification.id()), List.of(jana),
                List.of(claim(PETR, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED)), TODAY);
        Optional<VariableSymbol> declinedByPetr = policy.candidate(jana, link, standingOrder, Set.of(verification.id()), List.of(jana),
                List.of(claim(PETR, OLD_SYMBOL, SymbolClaimAnswer.DECLINED), claim(PETR, OTHER_OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED)), TODAY);

        assertThat(confirmedByPetr).isEmpty();
        assertThat(declinedByPetr).contains(OLD_SYMBOL);
    }

    @Test
    @DisplayName("Given a person verifying from a company's name or a company verifying from a person's name, when a candidate is sought, then there is none, while an absent name or a matching type is offered")
    void should_check_donor_type_when_sought_given_counterparty_names() {
        BankPayment fromCompany = verification(4, VERIFIED_ON, Optional.of("ABC s.r.o."));
        BankPayment fromPerson = verification(5, VERIFIED_ON, Optional.of(PAYER_NAME));
        BankPayment withoutName = verification(6, VERIFIED_ON, Optional.empty());

        assertThat(candidateFor(DonorType.PERSON, fromCompany)).isEmpty();
        assertThat(candidateFor(DonorType.COMPANY, fromPerson)).isEmpty();
        assertThat(candidateFor(DonorType.PERSON, withoutName)).contains(OLD_SYMBOL);
        assertThat(candidateFor(DonorType.COMPANY, withoutName)).contains(OLD_SYMBOL);
        assertThat(candidateFor(DonorType.COMPANY, fromCompany)).contains(OLD_SYMBOL);
        assertThat(candidateFor(DonorType.PERSON, fromPerson)).contains(OLD_SYMBOL);
    }

    @Test
    @DisplayName("Given a person's two verification payments, the later one from a company's name, when a candidate is sought, then there is none")
    void should_propose_nothing_when_sought_given_any_verification_payment_of_the_wrong_type() {
        BankPayment first = verification(4, LocalDate.of(2026, 9, 20), Optional.of(PAYER_NAME));
        BankPayment second = verification(5, VERIFIED_ON, Optional.of("ABC s.r.o."));
        SenderAccountLink proved = provedLink(first, Optional.empty());
        DonorRecord donor = janaWith(proved);

        Optional<VariableSymbol> candidate = policy.candidate(donor, proved, List.of(january, september, first, second),
                Set.of(first.id(), second.id()), List.of(donor), List.of(), TODAY);

        assertThat(candidate).isEmpty();
    }

    @Test
    @DisplayName("Given a candidate whose payments are all paired or all on days another donor's link also covers, when the offer is sought, then there is none")
    void should_offer_nothing_when_sought_given_nothing_pairable() {
        DonorRecord coOwner = petrWith(provedLink(gift(4, LocalDate.of(2024, 3, 1), PETR_SYMBOL.value()), Optional.empty()));

        assertThat(policy.offer(jana, ACCOUNT, OLD_SYMBOL, List.of(), List.of(jana))).isEmpty();
        assertThat(policy.offer(jana, ACCOUNT, OLD_SYMBOL, List.of(january, september), List.of(jana, coOwner))).isEmpty();
    }

    @Test
    @DisplayName("Given two verification payments, when a candidate is sought, then the earliest sets the verification day and a payment booked on that day counts")
    void should_take_earliest_verification_day_when_sought_given_two_verification_payments() {
        LocalDate earliest = LocalDate.of(2026, 5, 10);
        BankPayment first = verification(4, earliest);
        SenderAccountLink proved = provedLink(first, Optional.empty());
        DonorRecord donor = janaWith(proved);
        List<BankPayment> payments = List.of(gift(5, earliest, OLD_SYMBOL.value()), first, gift(6, LocalDate.of(2026, 7, 1), OTHER_OLD_SYMBOL.value()),
                verification);

        Optional<VariableSymbol> candidate = policy.candidate(donor, proved, payments, Set.of(first.id(), verification.id()), List.of(donor),
                List.of(), TODAY);

        assertThat(candidate).contains(OLD_SYMBOL);
    }

    @Test
    @DisplayName("Given a symbol first seen from the account after the verification day, when a candidate is sought, then it is neither offered nor blocks the old symbol")
    void should_neither_offer_nor_block_when_sought_given_symbol_seen_only_after_verification() {
        BankPayment later = gift(4, LocalDate.of(2026, 10, 20), OTHER_OLD_SYMBOL.value());

        Optional<VariableSymbol> withOldSymbol = policy.candidate(jana, link, List.of(january, september, verification, later),
                Set.of(verification.id()), List.of(jana), List.of(), TODAY);
        Optional<VariableSymbol> laterOnly = policy.candidate(jana, link, List.of(verification, later), Set.of(verification.id()), List.of(jana),
                List.of(), TODAY);

        assertThat(withOldSymbol).contains(OLD_SYMBOL);
        assertThat(laterOnly).isEmpty();
    }

    @Test
    @DisplayName("Given gifts with the donor's own symbol, padded or not, before the verification day, when a candidate is sought, then they are ignored")
    void should_ignore_own_symbol_when_sought_given_gifts_with_donors_symbol() {
        List<BankPayment> payments = List.of(january, gift(4, LocalDate.of(2025, 3, 1), JANA_SYMBOL.value()),
                gift(5, LocalDate.of(2025, 4, 1), "00" + JANA_SYMBOL.value()), september, verification);

        Optional<VariableSymbol> candidate = policy.candidate(jana, link, payments, Set.of(verification.id()), List.of(jana), List.of(), TODAY);

        assertThat(candidate).contains(OLD_SYMBOL);
    }

    @Test
    @DisplayName("Given unpaired payments with the symbol before and after the verification day and one on a day another donor's link also covered, when the offer is sought, then it counts and spans only the pairable ones")
    void should_count_pairable_payments_when_offered_given_payments_around_verification_and_ambiguous_day() {
        DonorRecord formerCoOwner = petrWith(endedLink(gift(4, LocalDate.of(2024, 3, 1), PETR_SYMBOL.value()), Optional.empty(),
                LocalDate.of(2024, 12, 31)));
        List<BankPayment> unpaired = List.of(gift(5, LocalDate.of(2024, 12, 15), OLD_SYMBOL.value()), january,
                gift(6, LocalDate.of(2025, 6, 15), OLD_SYMBOL.value()), gift(7, LocalDate.of(2025, 7, 15), OTHER_OLD_SYMBOL.value()),
                payment(8, LocalDate.of(2025, 8, 15), czk(50000), Optional.of(OTHER_ACCOUNT), OLD_SYMBOL.value()),
                gift(9, LocalDate.of(2026, 10, 20), OLD_SYMBOL.value()));

        Optional<SymbolClaimOffer> offer = policy.offer(jana, ACCOUNT, OLD_SYMBOL, unpaired, List.of(jana, formerCoOwner));

        assertThat(offer).contains(new SymbolClaimOffer(ACCOUNT, OLD_SYMBOL, 3, YearMonth.of(2025, 1), YearMonth.of(2026, 10)));
    }

    @Test
    @DisplayName("Given no excluded accounts, when the policy is made, then it is refused")
    void should_refuse_when_made_given_no_excluded_accounts() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SymbolClaimOfferPolicy(null));
    }

    private Optional<VariableSymbol> candidateFor(DonorType type, BankPayment verificationPayment) {
        SenderAccountLink proved = provedLink(verificationPayment, Optional.empty());
        DonorRecord donor = type == DonorType.PERSON
                ? janaWith(proved)
                : DonorRecord.reconstitute(JANA, DonorType.COMPANY, "ABC s.r.o.", "45274649", address(), JANA_SYMBOL, LocaleCode.CS,
                List.of(proved), NOW, NOW);
        return policy.candidate(donor, proved, List.of(january, september, verificationPayment), Set.of(verificationPayment.id()), List.of(donor),
                List.of(), TODAY);
    }

    private static BankPayment gift(long transactionId, LocalDate bookedOn, String variableSymbol) {
        return payment(transactionId, bookedOn, czk(50000), Optional.of(ACCOUNT), variableSymbol);
    }

    private static BankPayment verification(long transactionId, LocalDate bookedOn) {
        return verification(transactionId, bookedOn, Optional.of(PAYER_NAME));
    }

    private static BankPayment verification(long transactionId, LocalDate bookedOn, Optional<String> counterpartyName) {
        return payment(transactionId, bookedOn, czk(100), Optional.of(ACCOUNT), JANA_SYMBOL.value(), "OVERENI UCTU", counterpartyName);
    }

    private static SenderAccountLink provedLink(BankPayment proof, Optional<LocalDate> from) {
        return link(proof.id(), SenderAccountLinkStatus.ACTIVE, from, Optional.empty());
    }

    private static SenderAccountLink endedLink(BankPayment proof, Optional<LocalDate> from, LocalDate to) {
        return link(proof.id(), SenderAccountLinkStatus.DISCONNECTED, from, Optional.of(to));
    }

    private static SenderAccountLink link(BankPaymentId proof, SenderAccountLinkStatus status, Optional<LocalDate> from, Optional<LocalDate> to) {
        return SenderAccountLink.reconstitute(SenderAccountLinkId.newId(NOW), ACCOUNT, status, Optional.of(proof), Optional.of(NOW), from, to, NOW,
                to.map(day -> NOW));
    }

    private static DonorRecord janaWith(SenderAccountLink link) {
        return person(JANA, "Jana Nováková", JANA_SYMBOL, link);
    }

    private static DonorRecord petrWith(SenderAccountLink link) {
        return person(PETR, "Petr Svoboda", PETR_SYMBOL, link);
    }

    private static DonorRecord person(DonorReference id, String name, VariableSymbol symbol, SenderAccountLink link) {
        return DonorRecord.reconstitute(id, DonorType.PERSON, name, null, address(), symbol, LocaleCode.CS, List.of(link), NOW, NOW);
    }

    private static PostalAddress address() {
        return new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    }

    private static SymbolClaim claim(DonorReference donor, VariableSymbol symbol, SymbolClaimAnswer answer) {
        return SymbolClaim.reconstitute(SymbolClaimId.newId(NOW), donor, ACCOUNT, symbol, answer, NOW);
    }
}
