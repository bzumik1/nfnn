package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;

public sealed interface PairingDecision permits PairingDecision.PairBySymbol, PairingDecision.PairByAccount, PairingDecision.PairByConfirmedSymbol,
        PairingDecision.LeaveUnpaired {

    record PairBySymbol(DonorRecord donor) implements PairingDecision {
    }

    record PairByAccount(DonorRecord donor, SenderAccountLink link) implements PairingDecision {
    }

    record PairByConfirmedSymbol(DonorRecord donor, SenderAccountLink link, SymbolClaim claim) implements PairingDecision {
    }

    record LeaveUnpaired(UnpairedReason reason) implements PairingDecision {
    }
}
