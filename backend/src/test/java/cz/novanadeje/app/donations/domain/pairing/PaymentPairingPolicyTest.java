package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.LearnedSenderAccount;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static cz.novanadeje.app.donations.BankPayments.PAYER_NAME;
import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;

class PaymentPairingPolicyTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final VariableSymbol JANA_SYMBOL = new VariableSymbol("4821937560");
    private static final VariableSymbol PETR_SYMBOL = new VariableSymbol("7310945528");

    private final PaymentPairingPolicy policy = new PaymentPairingPolicy();
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

        assertThat(decision).isEqualTo(new PairingDecision.PairByAccount(owner));
    }

    @Test
    @DisplayName("Given a payment with the symbol 0 from an account with a single owner, when decided, then it is paired by account")
    void should_pair_by_account_when_decided_given_zero_symbol_and_single_owner() {
        DonorRecord owner = withAccount(jana);

        PairingDecision decision = policy.decide(payment(1, Optional.of(ACCOUNT), "0"), Optional.empty(), List.of(owner));

        assertThat(decision).isEqualTo(new PairingDecision.PairByAccount(owner));
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

    private static DonorRecord donor(String name, VariableSymbol symbol) {
        return DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), name, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                symbol, LocaleCode.CS, NOW);
    }

    private static DonorRecord withAccount(DonorRecord record) {
        return DonorRecord.reconstitute(record.id(), DonorType.PERSON, record.name(), null, record.address(), record.variableSymbol(),
                record.preferredLocale(), Set.of(new LearnedSenderAccount(ACCOUNT, BankPaymentId.newId(NOW), NOW)), record.registeredAt(), NOW);
    }
}
