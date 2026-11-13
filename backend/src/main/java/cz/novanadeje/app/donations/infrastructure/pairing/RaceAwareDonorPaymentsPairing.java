package cz.novanadeje.app.donations.infrastructure.pairing;

import cz.novanadeje.app.donations.application.pairing.DonorPaymentsPairing;
import cz.novanadeje.app.donations.application.pairing.PairingOutcome;
import cz.novanadeje.app.donations.application.pairing.PairingRaceLost;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;

@Component
class RaceAwareDonorPaymentsPairing implements DonorPaymentsPairing {

    private final PaymentPairingService pairing;

    RaceAwareDonorPaymentsPairing(PaymentPairingService pairing) {
        this.pairing = pairing;
    }

    @Override
    public Optional<PairingOutcome> pairPaymentsOf(DonorReference donor, Instant now) {
        try {
            return pairing.pairPaymentsOf(donor, now);
        } catch (DataIntegrityViolationException | PessimisticLockingFailureException lost) {
            throw new PairingRaceLost(lost);
        }
    }
}
