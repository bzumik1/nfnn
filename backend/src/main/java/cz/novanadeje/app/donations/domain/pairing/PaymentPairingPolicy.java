package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class PaymentPairingPolicy {

    private final ExcludedSenderAccounts excluded;

    public PaymentPairingPolicy(ExcludedSenderAccounts excluded) {
        if (excluded == null) {
            throw new IllegalArgumentException("Excluded sender accounts are required");
        }
        this.excluded = excluded;
    }

    public PairingDecision decide(BankPayment payment, Optional<DonorRecord> donorBySymbol, List<DonorRecord> accountOwners) {
        return decide(payment, donorBySymbol, accountOwners, List.of());
    }

    public PairingDecision decide(BankPayment payment, Optional<DonorRecord> donorBySymbol, List<DonorRecord> accountOwners,
                                  List<SymbolClaim> confirmedClaims) {
        if (payment.carriesVariableSymbol()) {
            Optional<DonorRecord> bySymbol = donorBySymbol.filter(donor -> donor.claimsBySymbol(payment));
            if (bySymbol.isPresent()) {
                return new PairingDecision.PairBySymbol(bySymbol.get());
            }
            return decideByConfirmedSymbol(payment, accountOwners, confirmedClaims);
        }
        if (payment.sender().isEmpty()) {
            return new PairingDecision.LeaveUnpaired(UnpairedReason.NO_IDENTIFICATION);
        }
        if (excluded.excludes(payment.sender().get())) {
            return new PairingDecision.LeaveUnpaired(UnpairedReason.EXCLUDED_SENDER_ACCOUNT);
        }
        return decideByAccount(payment, accountOwners);
    }

    public Optional<SenderAccountLink> confirmedSymbolLink(BankPayment payment, DonorReference claimant, List<DonorRecord> accountOwners) {
        Optional<SenderAccount> sender = payment.sender();
        if (!payment.carriesVariableSymbol() || sender.isEmpty() || excluded.excludes(sender.get())) {
            return Optional.empty();
        }
        Map<DonorReference, PairingDecision.PairByAccount> covering = coveringOwners(payment, accountOwners);
        if (covering.size() != 1) {
            return Optional.empty();
        }
        return Optional.ofNullable(covering.get(claimant)).map(PairingDecision.PairByAccount::link);
    }

    private PairingDecision decideByConfirmedSymbol(BankPayment payment, List<DonorRecord> accountOwners, List<SymbolClaim> confirmedClaims) {
        List<SymbolClaim> confirming = confirmedClaims.stream().filter(claim -> claim.confirms(payment)).toList();
        if (confirming.isEmpty()) {
            return new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_VARIABLE_SYMBOL);
        }
        if (excluded.excludes(payment.sender().orElseThrow())) {
            return new PairingDecision.LeaveUnpaired(UnpairedReason.EXCLUDED_SENDER_ACCOUNT);
        }
        Map<DonorReference, PairingDecision.PairByAccount> covering = coveringOwners(payment, accountOwners);
        if (covering.size() > 1) {
            return new PairingDecision.LeaveUnpaired(UnpairedReason.AMBIGUOUS_SENDER_ACCOUNT);
        }
        return covering.values().stream().findFirst()
                .flatMap(owner -> confirming.stream()
                        .filter(claim -> claim.donor().equals(owner.donor().id()))
                        .findFirst()
                        .<PairingDecision>map(claim -> new PairingDecision.PairByConfirmedSymbol(owner.donor(), owner.link(), claim)))
                .orElseGet(() -> new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_VARIABLE_SYMBOL));
    }

    private static PairingDecision decideByAccount(BankPayment payment, List<DonorRecord> accountOwners) {
        Map<DonorReference, PairingDecision.PairByAccount> owners = coveringOwners(payment, accountOwners);
        if (owners.size() == 1) {
            return owners.values().iterator().next();
        }
        if (owners.isEmpty()) {
            return new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_SENDER_ACCOUNT);
        }
        return new PairingDecision.LeaveUnpaired(UnpairedReason.AMBIGUOUS_SENDER_ACCOUNT);
    }

    private static Map<DonorReference, PairingDecision.PairByAccount> coveringOwners(BankPayment payment, List<DonorRecord> accountOwners) {
        Map<DonorReference, PairingDecision.PairByAccount> owners = new LinkedHashMap<>();
        for (DonorRecord owner : accountOwners) {
            owner.linkPairingPaymentsFrom(payment.sender().orElseThrow(), payment.bookedOn())
                    .ifPresent(link -> owners.putIfAbsent(owner.id(), new PairingDecision.PairByAccount(owner, link)));
        }
        return owners;
    }
}
