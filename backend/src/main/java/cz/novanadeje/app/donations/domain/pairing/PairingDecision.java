package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.donor.DonorRecord;

public sealed interface PairingDecision permits PairingDecision.PairBySymbol, PairingDecision.PairByAccount, PairingDecision.LeaveUnpaired {

    record PairBySymbol(DonorRecord donor) implements PairingDecision {
    }

    record PairByAccount(DonorRecord donor) implements PairingDecision {
    }

    record LeaveUnpaired(UnpairedReason reason) implements PairingDecision {
    }
}
