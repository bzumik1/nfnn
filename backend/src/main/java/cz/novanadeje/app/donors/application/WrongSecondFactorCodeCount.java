package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorSecondFactorCodesPaused;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.SecondFactorCodeReservation;
import cz.novanadeje.app.donors.domain.SecondFactorCodesPaused;
import cz.novanadeje.app.donors.domain.WrongSecondFactorCodes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Component
public class WrongSecondFactorCodeCount {

    private static final Logger log = LoggerFactory.getLogger(WrongSecondFactorCodeCount.class);

    private final WrongSecondFactorCodes wrongCodes;
    private final DonorRepository donors;
    private final ApplicationEventPublisher events;

    public WrongSecondFactorCodeCount(WrongSecondFactorCodes wrongCodes, DonorRepository donors, ApplicationEventPublisher events) {
        this.wrongCodes = wrongCodes;
        this.donors = donors;
        this.events = events;
    }

    @Transactional(noRollbackFor = SecondFactorCodesPaused.class)
    public void reserve(DonorId donorId, Instant now) {
        SecondFactorCodeReservation reservation = wrongCodes.reserve(donorId, now);
        if (reservation == SecondFactorCodeReservation.RESERVED) {
            return;
        }
        if (reservation == SecondFactorCodeReservation.PAUSE_STARTED) {
            log.warn("Second factor codes of donor {} are paused for an hour after {} wrong codes", donorId, WrongSecondFactorCodes.ALLOWED_IN_WINDOW);
            donors.findById(donorId).filter(donor -> !donor.isErased())
                    .ifPresent(donor -> events.publishEvent(new DonorSecondFactorCodesPaused(donorId.value(), donor.email(), donor.preferredLocale())));
        }
        throw new SecondFactorCodesPaused();
    }

    @Transactional
    public void release(DonorId donorId) {
        wrongCodes.release(donorId);
    }
}
