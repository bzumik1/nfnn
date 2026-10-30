package cz.novanadeje.app.donations.application.recovery;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryTarget;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.Iban;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SecondFactorRecoveryPaymentsTest {

    private static final Instant NOW = Instant.parse("2026-10-24T10:00:00Z");
    private static final SenderAccount ACCOUNT = new SenderAccount("19-2000145399", "0800");
    private static final Instant VERIFIED_AT = Instant.parse("2026-10-10T08:00:00Z");
    private static final BankAccount FOUNDATION = new BankAccount("5544332217/2010", new Iban("CZ2620100000005544332217"),
            "Nadační fond Nová naděje");

    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final SecondFactorRecoveryPayments recoveries = new SecondFactorRecoveryPayments(donorRecords, ExcludedSenderAccounts.none(),
            FOUNDATION, events);
    private final DonorRecord jana = donorWithAccount();

    @Test
    @DisplayName("Given a fresh 1 Kč with the code from the donor's account verified long enough, when inspected, then the recovery is announced to the donors context with the shortened account")
    void should_announce_the_recovery_when_inspected_given_a_valid_recovery_payment() {
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana));

        recoveries.inspect(List.of(payment(1, LocalDate.of(2026, 10, 24), Money.czk(100), Optional.of(ACCOUNT), null, "OBNOVA ABCD2345")), NOW);

        verify(events).publishEvent(new SecondFactorRecoveryPaid(jana.id().value(), new SecondFactorRecoveryCode("ABCD2345"), "…5399/0800", NOW));
    }

    @Test
    @DisplayName("Given fresh payments without a code or with a refused one, when inspected, then nothing is announced")
    void should_announce_nothing_when_inspected_given_no_code_or_a_refused_one() {
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana));

        recoveries.inspect(List.of(
                payment(1, LocalDate.of(2026, 10, 24), Money.czk(100), Optional.of(ACCOUNT), null, "Dar"),
                payment(2, LocalDate.of(2026, 10, 24), Money.czk(500), Optional.of(ACCOUNT), null, "OBNOVA ABCD2345"),
                payment(3, LocalDate.of(2026, 10, 15), Money.czk(100), Optional.of(ACCOUNT), null, "OBNOVA ABCD2345")), NOW);

        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given a donor with an account verified on 10 October, when the recovery target is asked for, then it names the foundation's account, 1 Kč and 17 October")
    void should_name_the_account_amount_and_first_day_when_the_target_is_asked_for() {
        when(donorRecords.findById(jana.id())).thenReturn(Optional.of(jana));

        assertThat(recoveries.targetFor(jana.id())).contains(new SecondFactorRecoveryTarget("5544332217/2010", "CZ2620100000005544332217",
                Money.czk(100), LocalDate.of(2026, 10, 17)));
    }

    @Test
    @DisplayName("Given a donor without a verified account or an unknown donor, when the recovery target is asked for, then there is none")
    void should_have_no_target_when_asked_for_given_no_verified_account_or_unknown_donor() {
        DonorRecord withoutAccount = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), "Petr Svoboda",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol("7310945528"), LocaleCode.CS, NOW);
        when(donorRecords.findById(withoutAccount.id())).thenReturn(Optional.of(withoutAccount));

        assertThat(recoveries.targetFor(withoutAccount.id())).isEmpty();
        assertThat(recoveries.targetFor(new DonorReference(UuidV7.generate(NOW)))).isEmpty();
    }

    @Test
    @DisplayName("Given a recovery code, when the payment text is asked for, then it is the SPAYD text of 1 Kč to the foundation's account with the recovery message and no variable symbol")
    void should_give_the_spayd_text_of_the_recovery_payment_when_asked_for_given_a_code() {
        assertThat(recoveries.spaydFor(new SecondFactorRecoveryCode("ABCD2345"))).isEqualTo(
                "SPD*1.0*ACC:CZ2620100000005544332217*AM:1.00*CC:CZK*RN:NADACNI FOND NOVA NADEJE*MSG:OBNOVA ABCD2345");
    }

    private static DonorRecord donorWithAccount() {
        SenderAccountLink link = SenderAccountLink.reconstitute(SenderAccountLinkId.newId(VERIFIED_AT), ACCOUNT, SenderAccountLinkStatus.ACTIVE,
                Optional.of(BankPaymentId.newId(VERIFIED_AT)), Optional.of(VERIFIED_AT), Optional.empty(), Optional.empty(), VERIFIED_AT,
                Optional.empty());
        return DonorRecord.reconstitute(new DonorReference(UuidV7.generate(NOW)), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol("4821937560"), LocaleCode.CS, List.of(link),
                VERIFIED_AT, VERIFIED_AT, null);
    }
}
