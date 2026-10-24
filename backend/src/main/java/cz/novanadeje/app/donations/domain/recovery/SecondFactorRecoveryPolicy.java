package cz.novanadeje.app.donations.domain.recovery;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

public final class SecondFactorRecoveryPolicy {

    public static final int ACCOUNT_AGE_DAYS = 7;
    public static final Money AMOUNT = Money.czk(100);

    private final ExcludedSenderAccounts excluded;

    public SecondFactorRecoveryPolicy(ExcludedSenderAccounts excluded) {
        if (excluded == null) {
            throw new IllegalArgumentException("Excluded sender accounts are required");
        }
        this.excluded = excluded;
    }

    public Optional<RecoveryDecision> decide(BankPayment payment, List<DonorRecord> accountOwners) {
        return payment.messageForRecipient()
                .flatMap(SecondFactorRecoveryCode::findIn)
                .map(code -> decide(payment, code, accountOwners));
    }

    public Optional<LocalDate> usableFrom(DonorRecord donor) {
        return donor.senderAccountLinks().stream()
                .filter(link -> link.isActive() && !excluded.excludes(link.account()))
                .map(SecondFactorRecoveryPolicy::usableFrom)
                .min(Comparator.naturalOrder());
    }

    private RecoveryDecision decide(BankPayment payment, SecondFactorRecoveryCode code, List<DonorRecord> accountOwners) {
        if (!payment.amount().equals(AMOUNT)) {
            return new RecoveryDecision.Refuse(RecoveryRefusal.WRONG_AMOUNT);
        }
        Optional<SenderAccount> sender = payment.sender();
        if (sender.isEmpty()) {
            return new RecoveryDecision.Refuse(RecoveryRefusal.NO_SENDER_ACCOUNT);
        }
        if (excluded.excludes(sender.get())) {
            return new RecoveryDecision.Refuse(RecoveryRefusal.EXCLUDED_SENDER_ACCOUNT);
        }
        List<Covering> covering = accountOwners.stream()
                .flatMap(owner -> owner.linkPairingPaymentsFrom(sender.get(), payment.bookedOn()).stream()
                        .filter(SenderAccountLink::isActive)
                        .map(link -> new Covering(owner, link)))
                .toList();
        if (covering.isEmpty()) {
            return new RecoveryDecision.Refuse(RecoveryRefusal.UNKNOWN_SENDER_ACCOUNT);
        }
        if (covering.stream().map(owner -> owner.donor().id()).distinct().count() > 1) {
            return new RecoveryDecision.Refuse(RecoveryRefusal.SHARED_SENDER_ACCOUNT);
        }
        Covering owner = covering.getFirst();
        if (usableFrom(owner.link()).isAfter(payment.bookedOn())) {
            return new RecoveryDecision.Refuse(RecoveryRefusal.ACCOUNT_TOO_NEW);
        }
        return new RecoveryDecision.Recover(owner.donor(), code, sender.get());
    }

    private static LocalDate usableFrom(SenderAccountLink link) {
        return link.provedAt().orElseThrow().atZone(FoundationCalendar.ZONE).toLocalDate().plusDays(ACCOUNT_AGE_DAYS);
    }

    private record Covering(DonorRecord donor, SenderAccountLink link) {
    }
}
