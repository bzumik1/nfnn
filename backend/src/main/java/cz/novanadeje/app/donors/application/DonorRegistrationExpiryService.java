package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.UnconfirmedRegistration;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

@Service
public class DonorRegistrationExpiryService {

    private final DonorRepository donors;
    private final Clock clock;

    public DonorRegistrationExpiryService(DonorRepository donors, Clock clock) {
        this.donors = donors;
        this.clock = clock;
    }

    @Transactional
    public ExpiredRegistrations expireUnconfirmed() {
        int deleted = donors.deleteUnconfirmedRegisteredBefore(UnconfirmedRegistration.expiredWhenRegisteredBefore(clock.instant()));
        return new ExpiredRegistrations(deleted, UnconfirmedRegistration.LIFETIME);
    }
}
