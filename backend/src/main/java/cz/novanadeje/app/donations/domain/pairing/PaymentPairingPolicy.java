package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;

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
        if (payment.carriesVariableSymbol()) {
            return decideBySymbol(payment, donorBySymbol);
        }
        if (payment.sender().isEmpty()) {
            return new PairingDecision.LeaveUnpaired(UnpairedReason.NO_IDENTIFICATION);
        }
        if (excluded.excludes(payment.sender().get())) {
            return new PairingDecision.LeaveUnpaired(UnpairedReason.EXCLUDED_SENDER_ACCOUNT);
        }
        return decideByAccount(payment, accountOwners);
    }

    private static PairingDecision decideBySymbol(BankPayment payment, Optional<DonorRecord> donorBySymbol) {
        return donorBySymbol
                .filter(donor -> donor.claimsBySymbol(payment))
                .<PairingDecision>map(PairingDecision.PairBySymbol::new)
                .orElseGet(() -> new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_VARIABLE_SYMBOL));
    }

    private static PairingDecision decideByAccount(BankPayment payment, List<DonorRecord> accountOwners) {
        Map<DonorReference, PairingDecision.PairByAccount> owners = new LinkedHashMap<>();
        for (DonorRecord owner : accountOwners) {
            owner.linkPairingPaymentsFrom(payment.sender().orElseThrow(), payment.bookedOn())
                    .ifPresent(link -> owners.putIfAbsent(owner.id(), new PairingDecision.PairByAccount(owner, link)));
        }
        if (owners.size() == 1) {
            return owners.values().iterator().next();
        }
        if (owners.isEmpty()) {
            return new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_SENDER_ACCOUNT);
        }
        return new PairingDecision.LeaveUnpaired(UnpairedReason.AMBIGUOUS_SENDER_ACCOUNT);
    }
}
