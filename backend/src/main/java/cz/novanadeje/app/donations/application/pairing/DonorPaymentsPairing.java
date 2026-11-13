package cz.novanadeje.app.donations.application.pairing;

import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.time.Instant;
import java.util.Optional;

public interface DonorPaymentsPairing {

    Optional<PairingOutcome> pairPaymentsOf(DonorReference donor, Instant now) throws PairingRaceLost;
}
