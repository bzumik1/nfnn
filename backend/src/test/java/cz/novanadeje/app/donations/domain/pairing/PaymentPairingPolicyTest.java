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
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static cz.novanadeje.app.donations.BankPayments.BOOKED_ON;
import static cz.novanadeje.app.donations.BankPayments.PAYER_NAME;
import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.shared.domain.Money.czk;
import static org.assertj.core.api.Assertions.assertThat;

class PaymentPairingPolicyTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final VariableSymbol JANA_SYMBOL = new VariableSymbol("4821937560");
    private static final VariableSymbol PETR_SYMBOL = new VariableSymbol("7310945528");
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");

    private final PaymentPairingPolicy policy = new PaymentPairingPolicy(ExcludedSenderAccounts.none());
    private final DonorRecord jana = donor("Jana Nováková", JANA_SYMBOL);
    private final DonorRecord petr = donor("Petr Svoboda", PETR_SYMBOL);

    @Test
    @DisplayName("Given a payment with the donor's symbol, when decided, then it is paired by symbol")
    void should_pair_by_symbol_when_decided_given_donor_symbol() {
        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), JANA_SYMBOL.value()), Optional.of(jana), List.of());

        assertThat(decision).isEqualTo(new PairingDecision.PairBySymbol(jana));
    }

    @Test
    @DisplayName("Given a payment with one donor's symbol from another donor's account, when decided, then the symbol wins")
    void should_pair_by_symbol_when_decided_given_symbol_from_other_owners_account() {
        DonorRecord petrPayingFromAccount = withAccount(petr);

        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), JANA_SYMBOL.value()), Optional.of(jana),
                List.of(petrPayingFromAccount));

        assertThat(decision).isEqualTo(new PairingDecision.PairBySymbol(jana));
    }

    @Test
    @DisplayName("Given a payment with a symbol nobody has from an account with a single owner, when decided, then it stays unpaired as an unknown symbol")
    void should_leave_unpaired_when_decided_given_unknown_symbol_from_single_owner_account() {
        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), "1111111111"), Optional.empty(), List.of(withAccount(jana)));

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_VARIABLE_SYMBOL));
    }

    @Test
    @DisplayName("Given a donor found for a symbol that is not the payment's, when decided, then it stays unpaired as an unknown symbol")
    void should_leave_unpaired_when_decided_given_donor_not_claiming_symbol() {
        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), "1111111111"), Optional.of(jana), List.of());

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_VARIABLE_SYMBOL));
    }

    @Test
    @DisplayName("Given a payment without a symbol from an account with a single owner, when decided, then it is paired by account")
    void should_pair_by_account_when_decided_given_no_symbol_and_single_owner() {
        DonorRecord owner = withAccount(jana);

        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), null), Optional.empty(), List.of(owner));

        assertThat(decision).isEqualTo(new PairingDecision.PairByAccount(owner, owner.senderAccountLinks().getFirst()));
    }

    @Test
    @DisplayName("Given a payment with the symbol 0 from an account with a single owner, when decided, then it is paired by account")
    void should_pair_by_account_when_decided_given_zero_symbol_and_single_owner() {
        DonorRecord owner = withAccount(jana);

        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), "0"), Optional.empty(), List.of(owner));

        assertThat(decision).isEqualTo(new PairingDecision.PairByAccount(owner, owner.senderAccountLinks().getFirst()));
    }

    @Test
    @DisplayName("Given a payment without a symbol from an account with two owners, when decided, then it stays unpaired as ambiguous")
    void should_leave_unpaired_when_decided_given_no_symbol_and_two_owners() {
        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), null), Optional.empty(), List.of(withAccount(jana), withAccount(petr)));

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.AMBIGUOUS_SENDER_ACCOUNT));
    }

    @Test
    @DisplayName("Given a payment without a symbol from an account nobody owns, when decided, then it stays unpaired as an unknown account")
    void should_leave_unpaired_when_decided_given_no_symbol_and_no_owner() {
        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), null), Optional.empty(), List.of());

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_SENDER_ACCOUNT));
    }

    @Test
    @DisplayName("Given an owner offered for an account it does not pay from, when decided, then it is not taken as the owner")
    void should_leave_unpaired_when_decided_given_owner_without_the_account() {
        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), null), Optional.empty(), List.of(jana));

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_SENDER_ACCOUNT));
    }

    @Test
    @DisplayName("Given a payment without a symbol and without a Czech sender, when decided, then it stays unpaired without identification")
    void should_leave_unpaired_when_decided_given_no_symbol_and_no_sender() {
        PairingDecision decision = policy.decide(payment(1, Optional.empty(), null), Optional.empty(), List.of());

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.NO_IDENTIFICATION));
    }

    @Test
    @DisplayName("Given a donor whose name equals the payer's and no symbol or account match, when decided, then the name is never considered")
    void should_leave_unpaired_when_decided_given_only_the_name_matches() {
        DonorRecord namesake = donor(PAYER_NAME, JANA_SYMBOL);
        BankPayment payment = payment(1, Optional.of(new SenderAccount("19-2000145399", "0800")), null);

        PairingDecision decision = policy.decide(payment, Optional.of(namesake), List.of());

        assertThat(payment.counterpartyName()).contains(namesake.name());
        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_SENDER_ACCOUNT));
    }

    @Test
    @DisplayName("Given a payment without a symbol from an excluded account with a single owner, when decided, then it stays unpaired as excluded")
    void should_leave_unpaired_when_decided_given_excluded_account() {
        PaymentPairingPolicy excluding = new PaymentPairingPolicy(new ExcludedSenderAccounts(Set.of(ACCOUNT)));

        PairingDecision decision = excluding.decide(payment(1, Optional.of(ACCOUNT), null), Optional.empty(), List.of(withAccount(jana)));

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.EXCLUDED_SENDER_ACCOUNT));
    }

    @Test
    @DisplayName("Given a payment with the donor's symbol from an excluded account, when decided, then it is still paired by symbol")
    void should_pair_by_symbol_when_decided_given_symbol_from_excluded_account() {
        PaymentPairingPolicy excluding = new PaymentPairingPolicy(new ExcludedSenderAccounts(Set.of(ACCOUNT)));

        PairingDecision decision = excluding.decide(payment(1, Optional.of(ACCOUNT), JANA_SYMBOL.value()), Optional.of(jana), List.of());

        assertThat(decision).isEqualTo(new PairingDecision.PairBySymbol(jana));
    }

    @Test
    @DisplayName("Given an account one donor gave up and another took over, when decided, then each payment goes to the donor whose link covers its booking day")
    void should_pair_by_booking_day_when_decided_given_account_passed_between_donors() {
        LocalDate released = LocalDate.of(2026, 9, 30);
        DonorRecord before = withLink(jana, Optional.empty(), Optional.of(released), SenderAccountLinkStatus.DISCONNECTED);
        DonorRecord after = withLink(petr, Optional.of(released.plusDays(1)), Optional.empty(), SenderAccountLinkStatus.ACTIVE);

        PairingDecision onRelease = policy.decide(payment(1, released, czk(10000), Optional.of(ACCOUNT), null), Optional.empty(), List.of(before, after));
        PairingDecision dayAfter = policy.decide(payment(2, released.plusDays(1), czk(10000), Optional.of(ACCOUNT), null), Optional.empty(),
                List.of(before, after));

        assertThat(onRelease).isEqualTo(new PairingDecision.PairByAccount(before, before.senderAccountLinks().getFirst()));
        assertThat(dayAfter).isEqualTo(new PairingDecision.PairByAccount(after, after.senderAccountLinks().getFirst()));
    }

    @Test
    @DisplayName("Given an owner whose link still awaits a payment, when decided, then the link pairs nothing")
    void should_leave_unpaired_when_decided_given_link_awaiting_payment() {
        DonorRecord awaiting = DonorRecord.reconstitute(jana.id(), DonorType.PERSON, jana.name(), null, jana.address(), jana.variableSymbol(),
                jana.preferredLocale(), List.of(SenderAccountLink.awaitingPayment(SenderAccountLinkId.newId(NOW), ACCOUNT, BOOKED_ON.minusDays(5), NOW)),
                jana.registeredAt(), NOW, null);

        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), null), Optional.empty(), List.of(awaiting));

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_SENDER_ACCOUNT));
    }

    @Test
    @DisplayName("Given a payment with a symbol nobody has from an account only the claimant's link covers, when decided with the claimant's confirmed claim, then it is paired by the confirmed symbol through that link")
    void should_pair_by_confirmed_symbol_when_decided_given_claimants_sole_covering_link() {
        DonorRecord owner = withAccount(jana);
        SymbolClaim claim = confirmed(jana, ACCOUNT, OLD_SYMBOL);
        BankPayment payment = payment(1, Optional.of(ACCOUNT), "00" + OLD_SYMBOL.value());

        PairingDecision decision = policy.decide(payment, Optional.empty(), List.of(owner), List.of(claim));

        assertThat(decision).isEqualTo(new PairingDecision.PairByConfirmedSymbol(owner, owner.senderAccountLinks().getFirst(), claim));
        assertThat(policy.confirmedSymbolLink(payment, jana.id(), List.of(owner))).contains(owner.senderAccountLinks().getFirst());
    }

    @Test
    @DisplayName("Given a declined claim, a claim for another account or a claim for another symbol, when decided, then the payment stays unpaired as an unknown symbol")
    void should_leave_unpaired_when_decided_given_no_matching_confirmed_claim() {
        DonorRecord owner = withAccount(jana);
        BankPayment payment = payment(1, Optional.of(ACCOUNT), OLD_SYMBOL.value());
        List<SymbolClaim> notMatching = List.of(
                claim(jana, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.DECLINED),
                confirmed(jana, new SenderAccount("1234567", "0800"), OLD_SYMBOL),
                confirmed(jana, ACCOUNT, new VariableSymbol("6123456788")));

        PairingDecision decision = policy.decide(payment, Optional.empty(), List.of(owner), notMatching);

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_VARIABLE_SYMBOL));
    }

    @Test
    @DisplayName("Given another donor's link that also covers the booking day, when decided with the claimant's confirmed claim, then the payment stays unpaired as ambiguous")
    void should_leave_unpaired_when_decided_given_another_donor_also_covering() {
        List<DonorRecord> owners = List.of(withAccount(jana), withAccount(petr));
        BankPayment payment = payment(1, Optional.of(ACCOUNT), OLD_SYMBOL.value());

        PairingDecision decision = policy.decide(payment, Optional.empty(), owners, List.of(confirmed(jana, ACCOUNT, OLD_SYMBOL)));

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.AMBIGUOUS_SENDER_ACCOUNT));
        assertThat(policy.confirmedSymbolLink(payment, jana.id(), owners)).isEmpty();
    }

    @Test
    @DisplayName("Given only another donor's link covering the booking day, or no link at all, when decided with the claimant's confirmed claim, then the payment stays unpaired as an unknown symbol")
    void should_leave_unpaired_when_decided_given_claimant_not_covering() {
        LocalDate released = BOOKED_ON.minusDays(1);
        DonorRecord janaBefore = withLink(jana, Optional.empty(), Optional.of(released), SenderAccountLinkStatus.DISCONNECTED);
        DonorRecord petrAfter = withLink(petr, Optional.of(released.plusDays(1)), Optional.empty(), SenderAccountLinkStatus.ACTIVE);
        BankPayment payment = payment(1, Optional.of(ACCOUNT), OLD_SYMBOL.value());
        List<SymbolClaim> claims = List.of(confirmed(jana, ACCOUNT, OLD_SYMBOL));

        PairingDecision onlyAnother = policy.decide(payment, Optional.empty(), List.of(janaBefore, petrAfter), claims);
        PairingDecision nobody = policy.decide(payment, Optional.empty(), List.of(janaBefore), claims);

        assertThat(onlyAnother).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_VARIABLE_SYMBOL));
        assertThat(nobody).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_VARIABLE_SYMBOL));
        assertThat(policy.confirmedSymbolLink(payment, jana.id(), List.of(janaBefore, petrAfter))).isEmpty();
        assertThat(policy.confirmedSymbolLink(payment, jana.id(), List.of(janaBefore))).isEmpty();
    }

    @Test
    @DisplayName("Given an excluded account the claimant's link covers, when decided with the claimant's confirmed claim, then the payment stays unpaired as excluded")
    void should_leave_unpaired_when_decided_given_confirmed_symbol_from_excluded_account() {
        PaymentPairingPolicy excluding = new PaymentPairingPolicy(new ExcludedSenderAccounts(Set.of(ACCOUNT)));
        DonorRecord owner = withAccount(jana);
        BankPayment payment = payment(1, Optional.of(ACCOUNT), OLD_SYMBOL.value());

        PairingDecision decision = excluding.decide(payment, Optional.empty(), List.of(owner), List.of(confirmed(jana, ACCOUNT, OLD_SYMBOL)));

        assertThat(decision).isEqualTo(new PairingDecision.LeaveUnpaired(UnpairedReason.EXCLUDED_SENDER_ACCOUNT));
        assertThat(excluding.confirmedSymbolLink(payment, jana.id(), List.of(owner))).isEmpty();
    }

    @Test
    @DisplayName("Given a symbol a donor registered and another donor's confirmed claim for it, when decided, then the registered donor's symbol wins")
    void should_pair_by_symbol_when_decided_given_registered_symbol_and_confirmed_claim() {
        DonorRecord owner = withAccount(jana);
        BankPayment payment = payment(1, Optional.of(ACCOUNT), PETR_SYMBOL.value());

        PairingDecision decision = policy.decide(payment, Optional.of(petr), List.of(owner), List.of(confirmed(jana, ACCOUNT, PETR_SYMBOL)));

        assertThat(decision).isEqualTo(new PairingDecision.PairBySymbol(petr));
    }

    @Test
    @DisplayName("Given a payment without a symbol and the claimant's confirmed claim, when decided, then the account rule alone decides")
    void should_pair_by_account_when_decided_given_claim_and_no_symbol() {
        DonorRecord owner = withAccount(jana);
        BankPayment payment = payment(1, Optional.of(ACCOUNT), null);

        PairingDecision decision = policy.decide(payment, Optional.empty(), List.of(owner), List.of(confirmed(jana, ACCOUNT, OLD_SYMBOL)));

        assertThat(decision).isEqualTo(new PairingDecision.PairByAccount(owner, owner.senderAccountLinks().getFirst()));
        assertThat(policy.confirmedSymbolLink(payment, jana.id(), List.of(owner))).isEmpty();
    }

    @Test
    @DisplayName("Given the claimant's link that covers only some days, when decided and asked for the confirmed symbol link, then both agree day by day")
    void should_agree_with_decision_when_asked_for_confirmed_symbol_link_given_bounded_link() {
        LocalDate from = LocalDate.of(2026, 10, 10);
        DonorRecord owner = withLink(jana, Optional.of(from), Optional.empty(), SenderAccountLinkStatus.ACTIVE);
        SymbolClaim claim = confirmed(jana, ACCOUNT, OLD_SYMBOL);

        for (LocalDate day : List.of(from.minusDays(1), from, from.plusDays(1))) {
            BankPayment payment = payment(1, day, czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
            boolean paired = policy.decide(payment, Optional.empty(), List.of(owner), List.of(claim)) instanceof PairingDecision.PairByConfirmedSymbol;

            assertThat(policy.confirmedSymbolLink(payment, jana.id(), List.of(owner)).isPresent()).isEqualTo(paired);
            assertThat(paired).isEqualTo(!day.isBefore(from));
        }
    }

    private static DonorRecord donor(String name, VariableSymbol symbol) {
        return DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), name, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                symbol, LocaleCode.CS, NOW);
    }

    private static DonorRecord withAccount(DonorRecord record) {
        return withLink(record, Optional.empty(), Optional.empty(), SenderAccountLinkStatus.ACTIVE);
    }

    private static DonorRecord withLink(DonorRecord record, Optional<LocalDate> from, Optional<LocalDate> to, SenderAccountLinkStatus status) {
        SenderAccountLink link = SenderAccountLink.reconstitute(SenderAccountLinkId.newId(NOW), ACCOUNT, status, Optional.of(BankPaymentId.newId(NOW)),
                Optional.of(NOW), from, to, NOW, to.map(day -> NOW));
        return DonorRecord.reconstitute(record.id(), DonorType.PERSON, record.name(), null, record.address(), record.variableSymbol(),
                record.preferredLocale(), List.of(link), record.registeredAt(), NOW, null);
    }

    private static SymbolClaim confirmed(DonorRecord donor, SenderAccount account, VariableSymbol symbol) {
        return claim(donor, account, symbol, SymbolClaimAnswer.CONFIRMED);
    }

    private static SymbolClaim claim(DonorRecord donor, SenderAccount account, VariableSymbol symbol, SymbolClaimAnswer answer) {
        return SymbolClaim.reconstitute(SymbolClaimId.newId(NOW), donor.id(), account, symbol, answer, NOW);
    }
}
