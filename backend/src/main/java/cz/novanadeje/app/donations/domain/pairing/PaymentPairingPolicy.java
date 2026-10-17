package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class PaymentPairingPolicy {

    public PairingDecision decide(BankPayment payment, Optional<DonorRecord> donorBySymbol, List<DonorRecord> accountOwners) {
        if (payment.carriesVariableSymbol()) {
            return decideBySymbol(payment, donorBySymbol);
        }
        return payment.sender()
                .map(sender -> decideByAccount(sender, accountOwners))
                .orElseGet(() -> new PairingDecision.LeaveUnpaired(UnpairedReason.NO_IDENTIFICATION));
    }

    private static PairingDecision decideBySymbol(BankPayment payment, Optional<DonorRecord> donorBySymbol) {
        return donorBySymbol
                .filter(donor -> donor.claimsBySymbol(payment))
                .<PairingDecision>map(PairingDecision.PairBySymbol::new)
                .orElseGet(() -> new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_VARIABLE_SYMBOL));
    }

    private static PairingDecision decideByAccount(SenderAccount sender, List<DonorRecord> accountOwners) {
        Map<DonorReference, DonorRecord> ownersById = accountOwners.stream()
                .filter(owner -> owner.paysFrom(sender))
                .collect(Collectors.toMap(DonorRecord::id, Function.identity(), (first, second) -> first, LinkedHashMap::new));
        List<DonorRecord> owners = List.copyOf(ownersById.values());
        if (owners.size() == 1) {
            return new PairingDecision.PairByAccount(owners.getFirst());
        }
        if (owners.isEmpty()) {
            return new PairingDecision.LeaveUnpaired(UnpairedReason.UNKNOWN_SENDER_ACCOUNT);
        }
        return new PairingDecision.LeaveUnpaired(UnpairedReason.AMBIGUOUS_SENDER_ACCOUNT);
    }
}
