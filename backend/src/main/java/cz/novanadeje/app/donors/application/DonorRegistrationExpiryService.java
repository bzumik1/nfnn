package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;

@Service
public class DonorRegistrationExpiryService {

    public static final Duration RETENTION = Duration.ofDays(30);

    private final DonorRepository donors;
    private final Clock clock;

    public DonorRegistrationExpiryService(DonorRepository donors, Clock clock) {
        this.donors = donors;
        this.clock = clock;
    }

    @Transactional
    public int expireUnconfirmed() {
        return donors.deleteUnconfirmedRegisteredBefore(clock.instant().minus(RETENTION));
    }
}
