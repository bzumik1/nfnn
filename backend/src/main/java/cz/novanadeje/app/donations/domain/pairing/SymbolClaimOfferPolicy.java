package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.CounterpartyNames;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

public final class SymbolClaimOfferPolicy {

    private final ExcludedSenderAccounts excluded;
    private final PaymentPairingPolicy pairing;

    public SymbolClaimOfferPolicy(ExcludedSenderAccounts excluded) {
        if (excluded == null) {
            throw new IllegalArgumentException("Excluded sender accounts are required");
        }
        this.excluded = excluded;
        this.pairing = new PaymentPairingPolicy(excluded);
    }

    public Optional<VariableSymbol> candidate(DonorRecord donor, SenderAccountLink link, List<BankPayment> paymentsFromAccount,
                                              Set<BankPaymentId> verificationPayments, List<DonorRecord> accountOwners,
                                              List<SymbolClaim> accountClaims, LocalDate today) {
        Optional<SenderAccount> active = donor.senderAccountLink(link.id()).filter(SenderAccountLink::isActive).map(SenderAccountLink::account);
        if (active.isEmpty() || excluded.excludes(active.get()) || usedByAnotherDonor(donor, active.get(), accountOwners, today)) {
            return Optional.empty();
        }
        SenderAccount account = active.get();
        List<BankPayment> fromAccount = paymentsFromAccount.stream().filter(payment -> sentFrom(payment, account)).toList();
        List<BankPayment> verifications = fromAccount.stream().filter(payment -> verificationPayments.contains(payment.id())).toList();
        if (verifications.isEmpty()
                || !verifications.stream().allMatch(payment -> CounterpartyNames.fitsDonorType(donor.type(), payment.counterpartyName()))) {
            return Optional.empty();
        }
        LocalDate verifiedOn = verifications.stream().map(BankPayment::bookedOn).min(Comparator.naturalOrder()).orElseThrow();
        Set<VariableSymbol> symbols = fromAccount.stream()
                .filter(payment -> !payment.bookedOn().isAfter(verifiedOn))
                .filter(payment -> donor.linkPairingPaymentsFrom(account, payment.bookedOn()).isPresent())
                .filter(payment -> !donor.claimsBySymbol(payment))
                .flatMap(payment -> payment.matchingVariableSymbol().stream())
                .collect(Collectors.toSet());
        if (symbols.size() != 1) {
            return Optional.empty();
        }
        VariableSymbol symbol = symbols.iterator().next();
        if (confirmedByAnotherDonor(donor, account, symbol, accountClaims) || answeredBy(donor, account, symbol, accountClaims)) {
            return Optional.empty();
        }
        return Optional.of(symbol);
    }

    public Optional<SymbolClaimOffer> offer(DonorRecord donor, SenderAccount account, VariableSymbol symbol, List<BankPayment> unpairedWithSymbol,
                                            List<DonorRecord> accountOwners) {
        List<LocalDate> pairable = unpairedWithSymbol.stream()
                .filter(payment -> sentFrom(payment, account) && payment.matchingVariableSymbol().filter(symbol::equals).isPresent())
                .filter(payment -> pairing.confirmedSymbolLink(payment, donor.id(), accountOwners).isPresent())
                .map(BankPayment::bookedOn)
                .sorted()
                .toList();
        if (pairable.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new SymbolClaimOffer(account, symbol, pairable.size(), YearMonth.from(pairable.getFirst()),
                YearMonth.from(pairable.getLast())));
    }

    private static boolean usedByAnotherDonor(DonorRecord donor, SenderAccount account, List<DonorRecord> accountOwners, LocalDate today) {
        return accountOwners.stream()
                .filter(owner -> !owner.id().equals(donor.id()))
                .anyMatch(owner -> owner.linkPairingPaymentsFrom(account, today).isPresent() || owner.usesSenderAccount(account));
    }

    private static boolean confirmedByAnotherDonor(DonorRecord donor, SenderAccount account, VariableSymbol symbol, List<SymbolClaim> accountClaims) {
        return accountClaims.stream()
                .anyMatch(claim -> !claim.donor().equals(donor.id()) && claim.isConfirmed() && claim.answers(account, symbol));
    }

    private static boolean answeredBy(DonorRecord donor, SenderAccount account, VariableSymbol symbol, List<SymbolClaim> accountClaims) {
        return accountClaims.stream().anyMatch(claim -> claim.donor().equals(donor.id()) && claim.answers(account, symbol));
    }

    private static boolean sentFrom(BankPayment payment, SenderAccount account) {
        return payment.sender().filter(account::equals).isPresent();
    }
}
