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
import java.util.List;
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
    private static final SenderAccountLinkId LINK = SenderAccountLinkId.newId(LATER);
    private static final LocalDate BOOKED_ON = LocalDate.of(2026, 10, 15);
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 18);

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
        assertThat(record.senderAccountLinks()).isEmpty();
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
                LocaleCode.CS, List.of(), REGISTERED_AT, REGISTERED_AT)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given stored account links, when reconstituted, then the record pairs payments from them")
    void should_pair_from_stored_links_when_reconstituted_given_account_links() {
        SenderAccountLink link = SenderAccountLink.reconstitute(LINK, ACCOUNT, SenderAccountLinkStatus.ACTIVE, Optional.of(PAYMENT),
                Optional.of(LATER), Optional.empty(), Optional.empty(), LATER, Optional.empty());

        DonorRecord record = DonorRecord.reconstitute(DONOR, DonorType.PERSON, "Jana Nováková", null, ADDRESS, SYMBOL,
                LocaleCode.EN, List.of(link), REGISTERED_AT, LATER);

        assertThat(record.senderAccountLinks()).containsExactly(link);
        assertThat(record.senderAccounts()).containsExactly(ACCOUNT);
        assertThat(record.linkPairingPaymentsFrom(ACCOUNT, BOOKED_ON)).contains(link);
        assertThat(record.usesSenderAccount(ACCOUNT)).isTrue();
        assertThat(record.updatedAt()).isEqualTo(LATER);
    }

    @Test
    @DisplayName("Given two live links to one account, when reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_two_live_links_to_one_account() {
        SenderAccountLink first = SenderAccountLink.reconstitute(LINK, ACCOUNT, SenderAccountLinkStatus.ACTIVE, Optional.of(PAYMENT),
                Optional.of(LATER), Optional.empty(), Optional.empty(), LATER, Optional.empty());
        SenderAccountLink second = SenderAccountLink.awaitingPayment(SenderAccountLinkId.newId(LATER), ACCOUNT, BOOKED_ON, LATER);

        assertThatThrownBy(() -> DonorRecord.reconstitute(DONOR, DonorType.PERSON, "Jana Nováková", null, ADDRESS, SYMBOL,
                LocaleCode.EN, List.of(first, second), REGISTERED_AT, LATER)).isInstanceOf(IllegalArgumentException.class);
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

        assertThatThrownBy(() -> learn(record, payment(PAYMENT, null, Optional.of(ACCOUNT))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> learn(record, payment(PAYMENT, "1111111111", Optional.of(ACCOUNT))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(record.senderAccounts()).isEmpty();
    }

    @Test
    @DisplayName("Given a payment with this record's symbol from a new Czech account, when an account is learned from it, then an active link since always is added with its proof")
    void should_learn_account_when_learned_given_own_symbol_from_new_account() {
        DonorRecord record = person();

        Optional<SenderAccountLink> learned = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT)));

        assertThat(learned).hasValueSatisfying(link -> {
            assertThat(link.account()).isEqualTo(ACCOUNT);
            assertThat(link.status()).isEqualTo(SenderAccountLinkStatus.ACTIVE);
            assertThat(link.provedBy()).contains(PAYMENT);
            assertThat(link.provedAt()).contains(LATER);
            assertThat(link.validFrom()).isEmpty();
            assertThat(link.validTo()).isEmpty();
        });
        assertThat(record.linkPairingPaymentsFrom(ACCOUNT, LocalDate.of(2001, 1, 1))).isEqualTo(learned);
        assertThat(record.senderAccountLinks()).containsExactly(learned.orElseThrow());
    }

    @Test
    @DisplayName("Given an account another donor gave up on a day, when learned, then the link starts the day after")
    void should_start_after_take_over_when_learned_given_account_released_by_another_donor() {
        DonorRecord record = person();

        SenderAccountLink learned = record.learnSenderAccountFrom(payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT)),
                Optional.of(LocalDate.of(2026, 9, 30)), ExcludedSenderAccounts.none(), LATER).orElseThrow();

        assertThat(learned.validFrom()).contains(LocalDate.of(2026, 10, 1));
        assertThat(record.linkPairingPaymentsFrom(ACCOUNT, LocalDate.of(2026, 9, 30))).isEmpty();
        assertThat(record.linkPairingPaymentsFrom(ACCOUNT, LocalDate.of(2026, 10, 1))).contains(learned);
    }

    @Test
    @DisplayName("Given an excluded account, when learned, then nothing is learned")
    void should_learn_nothing_when_learned_given_excluded_account() {
        DonorRecord record = person();

        Optional<SenderAccountLink> learned = record.learnSenderAccountFrom(payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT)),
                Optional.empty(), new ExcludedSenderAccounts(Set.of(ACCOUNT)), LATER);

        assertThat(learned).isEmpty();
        assertThat(record.senderAccountLinks()).isEmpty();
    }

    @Test
    @DisplayName("Given an account the record already knows, when learned again, then nothing is added")
    void should_learn_nothing_when_learned_given_known_account() {
        DonorRecord record = person();
        SenderAccountLink first = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();

        Optional<SenderAccountLink> again = record.learnSenderAccountFrom(
                payment(BankPaymentId.newId(LATER), SYMBOL.value(), Optional.of(ACCOUNT)), Optional.empty(), ExcludedSenderAccounts.none(),
                LATER.plusSeconds(60));

        assertThat(again).isEmpty();
        assertThat(record.senderAccountLinks()).containsExactly(first);
    }

    @Test
    @DisplayName("Given a payment with this record's symbol but no Czech sender, when an account is learned from it, then nothing is learned")
    void should_learn_nothing_when_learned_given_payment_without_czech_sender() {
        DonorRecord record = person();

        assertThat(learn(record, payment(PAYMENT, SYMBOL.value(), Optional.empty()))).isEmpty();
        assertThat(record.senderAccounts()).isEmpty();
    }

    @Test
    @DisplayName("Given an active link, when the donor disconnects it, then it pairs payments up to that day only and is released on it")
    void should_pair_up_to_the_day_when_disconnected_given_active_link() {
        DonorRecord record = person();
        SenderAccountLink link = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();

        SenderAccountLink disconnected = record.disconnectSenderAccount(link.id(), TODAY, LATER);

        assertThat(disconnected.status()).isEqualTo(SenderAccountLinkStatus.DISCONNECTED);
        assertThat(disconnected.validTo()).contains(TODAY);
        assertThat(disconnected.disconnectedAt()).contains(LATER);
        assertThat(record.linkPairingPaymentsFrom(ACCOUNT, TODAY)).contains(disconnected);
        assertThat(record.linkPairingPaymentsFrom(ACCOUNT, TODAY.plusDays(1))).isEmpty();
        assertThat(record.usesSenderAccount(ACCOUNT)).isFalse();
        assertThat(record.releasedSenderAccountOn(ACCOUNT)).contains(TODAY);
    }

    @Test
    @DisplayName("Given a disconnected link, when disconnected again, then it is a conflict")
    void should_refuse_when_disconnected_given_disconnected_link() {
        DonorRecord record = person();
        SenderAccountLink link = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();
        record.disconnectSenderAccount(link.id(), TODAY, LATER);

        assertThatThrownBy(() -> record.disconnectSenderAccount(link.id(), TODAY, LATER)).isInstanceOf(SenderAccountAlreadyDisconnected.class);
    }

    @Test
    @DisplayName("Given an unknown link id, when disconnected or reconnected, then it is not found")
    void should_not_find_when_disconnected_given_unknown_link() {
        DonorRecord record = person();

        assertThatThrownBy(() -> record.disconnectSenderAccount(LINK, TODAY, LATER)).isInstanceOf(SenderAccountLinkNotFound.class);
        assertThatThrownBy(() -> record.reconnectSenderAccount(LINK, TODAY, LATER)).isInstanceOf(SenderAccountLinkNotFound.class);
    }

    @Test
    @DisplayName("Given a disconnected account, when a new payment with the symbol comes from it, then it is not learned again by itself")
    void should_not_relearn_when_learned_given_disconnected_account() {
        DonorRecord record = person();
        SenderAccountLink link = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();
        record.disconnectSenderAccount(link.id(), TODAY, LATER);

        Optional<SenderAccountLink> again = learn(record, payment(BankPaymentId.newId(LATER), SYMBOL.value(), Optional.of(ACCOUNT), TODAY.plusDays(2)));

        assertThat(again).isEmpty();
        assertThat(record.senderAccountLinks()).hasSize(1);
    }

    @Test
    @DisplayName("Given a disconnected account, when the donor reconnects it, then a link awaits a payment from that day and only a later payment with the symbol proves it")
    void should_await_new_payment_when_reconnected_given_disconnected_account() {
        DonorRecord record = person();
        SenderAccountLink link = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();
        record.disconnectSenderAccount(link.id(), TODAY, LATER);
        LocalDate reconnectedOn = TODAY.plusDays(3);

        SenderAccountLink awaiting = record.reconnectSenderAccount(link.id(), reconnectedOn, LATER.plusSeconds(3600));

        assertThat(awaiting.status()).isEqualTo(SenderAccountLinkStatus.AWAITING_PAYMENT);
        assertThat(awaiting.validFrom()).contains(reconnectedOn);
        assertThat(record.linkPairingPaymentsFrom(ACCOUNT, reconnectedOn)).isEmpty();
        assertThat(learn(record, payment(BankPaymentId.newId(LATER), SYMBOL.value(), Optional.of(ACCOUNT), reconnectedOn.minusDays(1)))).isEmpty();

        BankPaymentId proof = BankPaymentId.newId(LATER);
        Optional<SenderAccountLink> proved = learn(record, payment(proof, SYMBOL.value(), Optional.of(ACCOUNT), reconnectedOn));

        assertThat(proved).containsSame(awaiting);
        assertThat(awaiting.status()).isEqualTo(SenderAccountLinkStatus.ACTIVE);
        assertThat(awaiting.provedBy()).contains(proof);
        assertThat(record.linkPairingPaymentsFrom(ACCOUNT, reconnectedOn)).contains(awaiting);
        assertThat(record.linkPairingPaymentsFrom(ACCOUNT, TODAY.plusDays(1))).isEmpty();
    }

    @Test
    @DisplayName("Given a disconnected account reconnected and still awaiting its payment, when asked for the release day, then it is the end of the ended link, and still once the payment proves the reconnect")
    void should_release_on_last_end_when_asked_given_reconnect_awaiting_or_proved() {
        DonorRecord record = person();
        SenderAccountLink link = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();
        record.disconnectSenderAccount(link.id(), TODAY, LATER);
        LocalDate reconnectedOn = TODAY.plusDays(3);
        record.reconnectSenderAccount(link.id(), reconnectedOn, LATER.plusSeconds(3600));

        assertThat(record.usesSenderAccount(ACCOUNT)).isFalse();
        assertThat(record.releasedSenderAccountOn(ACCOUNT)).contains(TODAY);

        learn(record, payment(BankPaymentId.newId(LATER), SYMBOL.value(), Optional.of(ACCOUNT), reconnectedOn)).orElseThrow();

        assertThat(record.usesSenderAccount(ACCOUNT)).isTrue();
        assertThat(record.releasedSenderAccountOn(ACCOUNT)).contains(TODAY);
    }

    @Test
    @DisplayName("Given a reconnect awaiting its payment from an account excluded since, when a payment with the symbol comes from it, then it does not prove the reconnect")
    void should_not_prove_awaiting_link_when_payment_with_symbol_arrives_given_excluded_account() {
        DonorRecord record = person();
        SenderAccountLink link = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();
        record.disconnectSenderAccount(link.id(), TODAY, LATER);
        LocalDate reconnectedOn = TODAY.plusDays(3);
        SenderAccountLink awaiting = record.reconnectSenderAccount(link.id(), reconnectedOn, LATER.plusSeconds(3600));

        Optional<SenderAccountLink> proved = record.learnSenderAccountFrom(
                payment(BankPaymentId.newId(LATER), SYMBOL.value(), Optional.of(ACCOUNT), reconnectedOn), Optional.empty(),
                new ExcludedSenderAccounts(Set.of(ACCOUNT)), LATER.plusSeconds(7200));

        assertThat(proved).isEmpty();
        assertThat(awaiting.status()).isEqualTo(SenderAccountLinkStatus.AWAITING_PAYMENT);
        assertThat(record.linkPairingPaymentsFrom(ACCOUNT, reconnectedOn)).isEmpty();
    }

    @Test
    @DisplayName("Given an active link that never ended, when asked for the release day, then there is none")
    void should_release_never_when_asked_given_active_link_never_ended() {
        DonorRecord record = person();
        learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();

        assertThat(record.releasedSenderAccountOn(ACCOUNT)).isEmpty();
        assertThatThrownBy(() -> record.releasedSenderAccountOn(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a reconnect disconnected again before a payment proved it, when asked for the release day, then it is the end of the last proved link")
    void should_release_on_last_proved_end_when_asked_given_unproved_reconnect_disconnected() {
        DonorRecord record = person();
        SenderAccountLink link = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();
        record.disconnectSenderAccount(link.id(), TODAY, LATER);
        SenderAccountLink awaiting = record.reconnectSenderAccount(link.id(), TODAY.plusDays(3), LATER.plusSeconds(3600));
        record.disconnectSenderAccount(awaiting.id(), TODAY.plusDays(5), LATER.plusSeconds(7200));

        assertThat(record.releasedSenderAccountOn(ACCOUNT)).contains(TODAY);
    }

    @Test
    @DisplayName("Given a live link, when reconnected, then it is a conflict")
    void should_refuse_when_reconnected_given_live_link() {
        DonorRecord record = person();
        SenderAccountLink link = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();

        assertThatThrownBy(() -> record.reconnectSenderAccount(link.id(), TODAY, LATER)).isInstanceOf(SenderAccountAlreadyConnected.class);
        record.disconnectSenderAccount(link.id(), TODAY, LATER);
        record.reconnectSenderAccount(link.id(), TODAY, LATER);
        assertThatThrownBy(() -> record.reconnectSenderAccount(link.id(), TODAY, LATER)).isInstanceOf(SenderAccountAlreadyConnected.class);
    }

    @Test
    @DisplayName("Given a record with a learned account, when the profile changes, then name, address, locale and update time change while the symbol and the accounts stay")
    void should_keep_symbol_and_accounts_when_profile_changed_given_learned_account() {
        DonorRecord record = person();
        learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT)));
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
    @DisplayName("Given the account links, when the caller changes the returned collections, then the record is not affected")
    void should_not_leak_internal_state_when_sets_returned_given_record() {
        DonorRecord record = person();

        assertThatThrownBy(() -> record.senderAccountLinks().add(SenderAccountLink.awaitingPayment(LINK, ACCOUNT, TODAY, LATER)))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> record.senderAccounts().add(ACCOUNT)).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    @DisplayName("Given a record with a learned account, when the link is removed, then it is returned and gone, and removing it again is not found")
    void should_forget_link_when_removed_given_learned_account() {
        DonorRecord record = person();
        SenderAccountLink link = learn(record, payment(PAYMENT, SYMBOL.value(), Optional.of(ACCOUNT))).orElseThrow();

        SenderAccountLink removed = record.removeSenderAccountLink(link.id());

        assertThat(removed).isSameAs(link);
        assertThat(record.senderAccountLinks()).isEmpty();
        assertThat(record.senderAccounts()).isEmpty();
        assertThat(record.usesSenderAccount(ACCOUNT)).isFalse();
        assertThatThrownBy(() -> record.removeSenderAccountLink(link.id())).isInstanceOf(SenderAccountLinkNotFound.class);
    }

    private static DonorRecord person() {
        return DonorRecord.registerPerson(DONOR, "Jana Nováková", ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT);
    }

    private static DonorRecord company(String identifier) {
        return DonorRecord.registerCompany(DONOR, "Stavby Novák s.r.o.", identifier, new PostalAddress("Průmyslová 5", "Teplice", "415 01"),
                SYMBOL, LocaleCode.CS, REGISTERED_AT);
    }

    private static Optional<SenderAccountLink> learn(DonorRecord record, BankPayment payment) {
        return record.learnSenderAccountFrom(payment, Optional.empty(), ExcludedSenderAccounts.none(), LATER);
    }

    private static BankPayment payment(BankPaymentId id, String variableSymbol, Optional<SenderAccount> sender) {
        return payment(id, variableSymbol, sender, BOOKED_ON);
    }

    private static BankPayment payment(BankPaymentId id, String variableSymbol, Optional<SenderAccount> sender, LocalDate bookedOn) {
        return BankPayment.incoming(id, IncomingMovement.of(new BankTransactionId(1001), bookedOn, Money.czk(50000), sender,
                sender.map(SenderAccount::accountNumber), sender.map(SenderAccount::bankCode), Optional.of("Nováková Jana"),
                Optional.ofNullable(variableSymbol), Optional.empty(), Optional.empty(), Optional.empty(), "Bezhotovostní příjem"), LATER);
    }
}
