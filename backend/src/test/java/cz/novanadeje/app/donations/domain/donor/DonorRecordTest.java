package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DonorRecordTest {

    private static final Instant REGISTERED_AT = Instant.parse("2026-10-17T10:00:00Z");
    private static final Instant LATER = Instant.parse("2026-10-18T08:30:00Z");
    private static final DonorReference DONOR = new DonorReference(UuidV7.generate(REGISTERED_AT));
    private static final VariableSymbol SYMBOL = new VariableSymbol("4821937560");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final BankPaymentId PAYMENT = BankPaymentId.newId(LATER);

    @Test
    @DisplayName("Given a person's details, when the record is registered, then it is a person without a company identifier and with the given profile")
    void should_hold_person_profile_when_registered_given_person_details() {
        DonorRecord record = person();

        assertThat(record.id()).isEqualTo(DONOR);
        assertThat(record.type()).isEqualTo(DonorType.PERSON);
        assertThat(record.name()).isEqualTo("Jana Nováková");
        assertThat(record.companyIdentifier()).isEmpty();
        assertThat(record.address()).isEqualTo(ADDRESS);
        assertThat(record.variableSymbol()).isEqualTo(SYMBOL);
        assertThat(record.preferredLocale()).isEqualTo(LocaleCode.CS);
        assertThat(record.senderAccounts()).isEmpty();
        assertThat(record.learnedSenderAccounts()).isEmpty();
        assertThat(record.registeredAt()).isEqualTo(REGISTERED_AT);
        assertThat(record.updatedAt()).isEqualTo(REGISTERED_AT);
    }

    @Test
    @DisplayName("Given a name with surrounding spaces, when the record is registered, then the name is trimmed")
    void should_trim_name_when_registered_given_padded_name() {
        DonorRecord record = DonorRecord.registerPerson(DONOR, "  Jana Nováková ", ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT);

        assertThat(record.name()).isEqualTo("Jana Nováková");
    }

    @Test
    @DisplayName("Given a blank or overlong name, when the record is registered, then it is refused")
    void should_refuse_when_registered_given_invalid_name() {
        assertThatThrownBy(() -> DonorRecord.registerPerson(DONOR, " ", ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DonorRecord.registerPerson(DONOR, "x".repeat(161), ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a company with its identification number, when the record is registered, then it is a company carrying the identifier")
    void should_carry_identifier_when_registered_given_company() {
        DonorRecord record = company("45274649");

        assertThat(record.type()).isEqualTo(DonorType.COMPANY);
        assertThat(record.companyIdentifier()).contains("45274649");
    }

    @Test
    @DisplayName("Given a company without an identification number, when the record is registered, then it is refused")
    void should_refuse_when_registered_given_company_without_identifier() {
        assertThatThrownBy(() -> company(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> company("  ")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a company identifier that is not eight digits, when the record is registered, then it is refused")
    void should_refuse_when_registered_given_malformed_identifier() {
        assertThatThrownBy(() -> company("4527464")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> company("4527464X")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a company identifier with a wrong check digit, when the record is registered, then it is accepted because donors validated it")
    void should_accept_when_registered_given_identifier_with_wrong_check_digit() {
        assertThat(company("45274648").companyIdentifier()).contains("45274648");
    }

    @Test
    @DisplayName("Given a stored person with an identifier, when reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_person_with_identifier() {
        assertThatThrownBy(() -> DonorRecord.reconstitute(DONOR, DonorType.PERSON, "Jana Nováková", "45274649", ADDRESS, SYMBOL,
                LocaleCode.CS, Set.of(), REGISTERED_AT, REGISTERED_AT)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given stored learned accounts, when reconstituted, then the record pays from them")
    void should_pay_from_stored_accounts_when_reconstituted_given_learned_accounts() {
        LearnedSenderAccount learned = new LearnedSenderAccount(ACCOUNT, PAYMENT, LATER);

        DonorRecord record = DonorRecord.reconstitute(DONOR, DonorType.PERSON, "Jana Nováková", null, ADDRESS, SYMBOL,
                LocaleCode.EN, Set.of(learned), REGISTERED_AT, LATER);

        assertThat(record.learnedSenderAccounts()).containsExactly(learned);
        assertThat(record.senderAccounts()).containsExactly(ACCOUNT);
        assertThat(record.paysFrom(ACCOUNT)).isTrue();
        assertThat(record.updatedAt()).isEqualTo(LATER);
    }

    @Test
    @DisplayName("Given a payment whose matching symbol is the record's, when asked, then the record claims it by symbol")
    void should_claim_when_asked_given_payment_with_own_symbol() {
        assertThat(person().claimsBySymbol(payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT)))).isTrue();
    }

    @Test
    @DisplayName("Given a payment whose symbol is the record's padded with zeros, when asked, then the record claims it by its matching form")
    void should_claim_when_asked_given_payment_with_own_symbol_padded_with_zeros() {
        assertThat(person().claimsBySymbol(payment(PAYMENT, "000" + SYMBOL.value(), Optional.of(ACCOUNT)))).isTrue();
    }

    @Test
    @DisplayName("Given a payment with another symbol or none, when asked, then the record does not claim it")
    void should_not_claim_when_asked_given_payment_with_other_or_no_symbol() {
        DonorRecord record = person();

        assertThat(record.claimsBySymbol(payment(PAYMENT, "1111111111", Optional.of(ACCOUNT)))).isFalse();
        assertThat(record.claimsBySymbol(payment(PAYMENT, null, Optional.of(ACCOUNT)))).isFalse();
    }

    @Test
    @DisplayName("Given a payment without this record's symbol, when an account is learned from it, then it is refused by the safe rule")
    void should_refuse_learning_when_learned_given_payment_without_own_symbol() {
        DonorRecord record = person();

        assertThatThrownBy(() -> record.learnSenderAccountFrom(payment(PAYMENT, null, Optional.of(ACCOUNT)), LATER))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> record.learnSenderAccountFrom(payment(PAYMENT, "1111111111", Optional.of(ACCOUNT)), LATER))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(record.senderAccounts()).isEmpty();
    }

    @Test
    @DisplayName("Given a payment with this record's symbol from a new Czech account, when an account is learned from it, then the account is added with its provenance")
    void should_learn_account_when_learned_given_own_symbol_from_new_account() {
        DonorRecord record = person();

        Optional<LearnedSenderAccount> learned = record.learnSenderAccountFrom(payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT)), LATER);

        assertThat(learned).contains(new LearnedSenderAccount(ACCOUNT, PAYMENT, LATER));
        assertThat(record.paysFrom(ACCOUNT)).isTrue();
        assertThat(record.learnedSenderAccounts()).containsExactly(learned.orElseThrow());
    }

    @Test
    @DisplayName("Given an account the record already knows, when learned again, then nothing is added")
    void should_learn_nothing_when_learned_given_known_account() {
        DonorRecord record = person();
        record.learnSenderAccountFrom(payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT)), LATER);

        Optional<LearnedSenderAccount> again = record.learnSenderAccountFrom(
                payment(BankPaymentId.newId(LATER), SYMBOL.value(), Optional.of(ACCOUNT)), LATER.plusSeconds(60));

        assertThat(again).isEmpty();
        assertThat(record.learnedSenderAccounts()).containsExactly(new LearnedSenderAccount(ACCOUNT, PAYMENT, LATER));
    }

    @Test
    @DisplayName("Given a payment with this record's symbol but no Czech sender, when an account is learned from it, then nothing is learned")
    void should_learn_nothing_when_learned_given_payment_without_czech_sender() {
        DonorRecord record = person();

        assertThat(record.learnSenderAccountFrom(payment(PAYMENT, SYMBOL.value(), Optional.empty()), LATER)).isEmpty();
        assertThat(record.senderAccounts()).isEmpty();
    }

    @Test
    @DisplayName("Given a record with a learned account, when the profile changes, then name, address, locale and update time change while the symbol and the accounts stay")
    void should_keep_symbol_and_accounts_when_profile_changed_given_learned_account() {
        DonorRecord record = person();
        record.learnSenderAccountFrom(payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT)), LATER);
        PostalAddress newAddress = new PostalAddress("Krátká 3", "Praha", "110 00");

        record.changeProfile(" Jana Malá ", newAddress, LocaleCode.EN, LATER);

        assertThat(record.name()).isEqualTo("Jana Malá");
        assertThat(record.address()).isEqualTo(newAddress);
        assertThat(record.preferredLocale()).isEqualTo(LocaleCode.EN);
        assertThat(record.updatedAt()).isEqualTo(LATER);
        assertThat(record.variableSymbol()).isEqualTo(SYMBOL);
        assertThat(record.senderAccounts()).containsExactly(ACCOUNT);
        assertThat(record.registeredAt()).isEqualTo(REGISTERED_AT);
    }

    @Test
    @DisplayName("Given a record, when the profile changes to a blank name, then it is refused and the profile stays")
    void should_refuse_when_profile_changed_given_blank_name() {
        DonorRecord record = person();

        assertThatThrownBy(() -> record.changeProfile(" ", ADDRESS, LocaleCode.EN, LATER)).isInstanceOf(IllegalArgumentException.class);
        assertThat(record.name()).isEqualTo("Jana Nováková");
        assertThat(record.preferredLocale()).isEqualTo(LocaleCode.CS);
    }

    @Test
    @DisplayName("Given a record, when the profile changes without a locale, then it is refused and neither name nor address changes")
    void should_change_nothing_when_profile_changed_given_missing_locale() {
        DonorRecord record = person();

        assertThatThrownBy(() -> record.changeProfile("Jana Malá", new PostalAddress("Krátká 3", "Praha", "110 00"), null, LATER))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(record.name()).isEqualTo("Jana Nováková");
        assertThat(record.address()).isEqualTo(ADDRESS);
        assertThat(record.updatedAt()).isEqualTo(REGISTERED_AT);
    }

    @Test
    @DisplayName("Given the learned accounts, when the caller changes the returned sets, then the record is not affected")
    void should_not_leak_internal_state_when_sets_returned_given_record() {
        DonorRecord record = person();

        assertThatThrownBy(() -> record.learnedSenderAccounts().add(new LearnedSenderAccount(ACCOUNT, PAYMENT, LATER)))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> record.senderAccounts().add(ACCOUNT)).isInstanceOf(UnsupportedOperationException.class);
    }

    private static DonorRecord person() {
        return DonorRecord.registerPerson(DONOR, "Jana Nováková", ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT);
    }

    private static DonorRecord company(String identifier) {
        return DonorRecord.registerCompany(DONOR, "Stavby Novák s.r.o.", identifier, new PostalAddress("Průmyslová 5", "Teplice", "415 01"),
                SYMBOL, LocaleCode.CS, REGISTERED_AT);
    }

    private static BankPayment payment(BankPaymentId id, String variableSymbol, Optional<SenderAccount> sender) {
        return BankPayment.incoming(id, IncomingMovement.of(new BankTransactionId(1001), LocalDate.of(2026, 10, 15), Money.czk(50000), sender,
                sender.map(SenderAccount::accountNumber), sender.map(SenderAccount::bankCode), Optional.of("Nováková Jana"),
                Optional.ofNullable(variableSymbol), Optional.empty(), Optional.empty(), Optional.empty(), "Bezhotovostní příjem"), LATER);
    }
}
