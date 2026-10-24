package cz.novanadeje.app.donations.domain.recovery;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;

class SecondFactorRecoveryPolicyTest {

    private static final Instant NOW = Instant.parse("2026-10-24T10:00:00Z");
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final SenderAccount OTHER_ACCOUNT = new SenderAccount("19-2000145399", "0800");
    private static final LocalDate PAID_ON = LocalDate.of(2026, 10, 24);
    private static final Instant SEVEN_DAYS_BEFORE = Instant.parse("2026-10-16T22:30:00Z");
    private static final Instant SIX_DAYS_BEFORE = Instant.parse("2026-10-17T22:30:00Z");
    private static final SecondFactorRecoveryCode CODE = new SecondFactorRecoveryCode("ABCD2345");

    private final SecondFactorRecoveryPolicy policy = new SecondFactorRecoveryPolicy(ExcludedSenderAccounts.none());
    private final DonorRecord jana = donor("Jana Nováková", "4821937560");
    private final DonorRecord petr = donor("Petr Svoboda", "7310945528");

    @Test
    @DisplayName("Given 1 Kč with the code from an account the donor verified seven days before in Prague, when decided, then the donor's second factor is recovered")
    void should_recover_when_decided_given_one_crown_with_the_code_from_an_account_verified_seven_days_before() {
        DonorRecord owner = withLink(jana, ACCOUNT, SEVEN_DAYS_BEFORE, SenderAccountLinkStatus.ACTIVE);

        Optional<RecoveryDecision> decision = policy.decide(recoveryPayment(Money.czk(100), Optional.of(ACCOUNT), "Obnova abcd 2345"),
                List.of(owner));

        assertThat(decision).contains(new RecoveryDecision.Recover(owner, CODE, ACCOUNT));
    }

    @Test
    @DisplayName("Given a payment without a recovery code, when decided, then it is no recovery at all")
    void should_decide_nothing_when_decided_given_no_code() {
        DonorRecord owner = withLink(jana, ACCOUNT, SEVEN_DAYS_BEFORE, SenderAccountLinkStatus.ACTIVE);

        assertThat(policy.decide(recoveryPayment(Money.czk(100), Optional.of(ACCOUNT), "Ověření účtu"), List.of(owner))).isEmpty();
        assertThat(policy.decide(recoveryPayment(Money.czk(100), Optional.of(ACCOUNT), null), List.of(owner))).isEmpty();
    }

    @Test
    @DisplayName("Given the code with another amount than 1 Kč, when decided, then the recovery is refused for the amount")
    void should_refuse_for_the_amount_when_decided_given_more_than_one_crown() {
        DonorRecord owner = withLink(jana, ACCOUNT, SEVEN_DAYS_BEFORE, SenderAccountLinkStatus.ACTIVE);

        assertThat(policy.decide(recoveryPayment(Money.czk(200), Optional.of(ACCOUNT), CODE.message()), List.of(owner)))
                .contains(new RecoveryDecision.Refuse(RecoveryRefusal.WRONG_AMOUNT));
    }

    @Test
    @DisplayName("Given the code from an account verified six days before, when decided, then the recovery is refused as too new")
    void should_refuse_as_too_new_when_decided_given_an_account_verified_six_days_before() {
        DonorRecord owner = withLink(jana, ACCOUNT, SIX_DAYS_BEFORE, SenderAccountLinkStatus.ACTIVE);

        assertThat(policy.decide(recoveryPayment(Money.czk(100), Optional.of(ACCOUNT), CODE.message()), List.of(owner)))
                .contains(new RecoveryDecision.Refuse(RecoveryRefusal.ACCOUNT_TOO_NEW));
    }

    @Test
    @DisplayName("Given the code from no account, an account nobody verified, an excluded one or one two donors verified, when decided, then the recovery is refused for the account")
    void should_refuse_for_the_account_when_decided_given_no_unknown_excluded_or_shared_account() {
        DonorRecord janaOwner = withLink(jana, ACCOUNT, SEVEN_DAYS_BEFORE, SenderAccountLinkStatus.ACTIVE);
        DonorRecord petrOwner = withLink(petr, ACCOUNT, SEVEN_DAYS_BEFORE, SenderAccountLinkStatus.ACTIVE);
        SecondFactorRecoveryPolicy excluding = new SecondFactorRecoveryPolicy(new ExcludedSenderAccounts(Set.of(ACCOUNT)));

        assertThat(policy.decide(recoveryPayment(Money.czk(100), Optional.empty(), CODE.message()), List.of()))
                .contains(new RecoveryDecision.Refuse(RecoveryRefusal.NO_SENDER_ACCOUNT));
        assertThat(policy.decide(recoveryPayment(Money.czk(100), Optional.of(ACCOUNT), CODE.message()), List.of()))
                .contains(new RecoveryDecision.Refuse(RecoveryRefusal.UNKNOWN_SENDER_ACCOUNT));
        assertThat(excluding.decide(recoveryPayment(Money.czk(100), Optional.of(ACCOUNT), CODE.message()), List.of(janaOwner)))
                .contains(new RecoveryDecision.Refuse(RecoveryRefusal.EXCLUDED_SENDER_ACCOUNT));
        assertThat(policy.decide(recoveryPayment(Money.czk(100), Optional.of(ACCOUNT), CODE.message()), List.of(janaOwner, petrOwner)))
                .contains(new RecoveryDecision.Refuse(RecoveryRefusal.SHARED_SENDER_ACCOUNT));
    }

    @Test
    @DisplayName("Given the code from an account whose pairing the donor switched off, when decided, then the recovery is refused for the account")
    void should_refuse_for_the_account_when_decided_given_a_disconnected_account() {
        DonorRecord owner = withLink(jana, ACCOUNT, SEVEN_DAYS_BEFORE, SenderAccountLinkStatus.DISCONNECTED);

        assertThat(policy.decide(recoveryPayment(Money.czk(100), Optional.of(ACCOUNT), CODE.message()), List.of(owner)))
                .contains(new RecoveryDecision.Refuse(RecoveryRefusal.UNKNOWN_SENDER_ACCOUNT));
    }

    @Test
    @DisplayName("Given a donor's verified accounts, when asked from when one can pay, then it is the earliest day seven days after a live verification")
    void should_name_the_earliest_usable_day_when_asked_given_verified_accounts() {
        DonorRecord twoAccounts = DonorRecord.reconstitute(jana.id(), DonorType.PERSON, jana.name(), null, jana.address(), jana.variableSymbol(),
                jana.preferredLocale(), List.of(link(ACCOUNT, SIX_DAYS_BEFORE, SenderAccountLinkStatus.ACTIVE),
                        link(OTHER_ACCOUNT, SEVEN_DAYS_BEFORE, SenderAccountLinkStatus.DISCONNECTED)), jana.registeredAt(), NOW, null);

        assertThat(policy.usableFrom(twoAccounts)).contains(LocalDate.of(2026, 10, 25));
        assertThat(policy.usableFrom(withLink(jana, ACCOUNT, SEVEN_DAYS_BEFORE, SenderAccountLinkStatus.ACTIVE))).contains(PAID_ON);
        assertThat(policy.usableFrom(jana)).isEmpty();
        assertThat(new SecondFactorRecoveryPolicy(new ExcludedSenderAccounts(Set.of(ACCOUNT)))
                .usableFrom(withLink(jana, ACCOUNT, SEVEN_DAYS_BEFORE, SenderAccountLinkStatus.ACTIVE))).isEmpty();
    }

    private static BankPayment recoveryPayment(Money amount, Optional<SenderAccount> sender, String message) {
        return payment(1, PAID_ON, amount, sender, null, message);
    }

    private static DonorRecord donor(String name, String symbol) {
        return DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), name, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new VariableSymbol(symbol), LocaleCode.CS, NOW);
    }

    private static DonorRecord withLink(DonorRecord record, SenderAccount account, Instant provedAt, SenderAccountLinkStatus status) {
        return DonorRecord.reconstitute(record.id(), DonorType.PERSON, record.name(), null, record.address(), record.variableSymbol(),
                record.preferredLocale(), List.of(link(account, provedAt, status)), record.registeredAt(), NOW, null);
    }

    private static SenderAccountLink link(SenderAccount account, Instant provedAt, SenderAccountLinkStatus status) {
        boolean disconnected = status == SenderAccountLinkStatus.DISCONNECTED;
        return SenderAccountLink.reconstitute(SenderAccountLinkId.newId(provedAt), account, status, Optional.of(BankPaymentId.newId(provedAt)),
                Optional.of(provedAt), Optional.empty(), disconnected ? Optional.of(LocalDate.of(2026, 10, 20)) : Optional.empty(), provedAt,
                disconnected ? Optional.of(provedAt) : Optional.empty());
    }
}
