package cz.novanadeje.app.donations.application.pairing;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@Transactional
public class PaymentPairingService {

    public PairingOutcome pairUnpaired(Instant now) {
        return new PairingOutcome(0, 0, 0, 0);
    }
}
