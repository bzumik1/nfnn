package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.SecondFactorCodeReservation;
import cz.novanadeje.app.donors.domain.WrongSecondFactorCodes;
import org.springframework.stereotype.Repository;

import java.time.Instant;

@Repository
class JpaWrongSecondFactorCodes implements WrongSecondFactorCodes {

    private final WrongSecondFactorCodesJpaRepository jpa;

    JpaWrongSecondFactorCodes(WrongSecondFactorCodesJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public SecondFactorCodeReservation reserve(DonorId donorId, Instant now) {
        jpa.insertIfMissing(donorId.value(), now);
        jpa.restartIfOver(donorId.value(), now, now.minus(WINDOW));
        if (jpa.reserve(donorId.value(), ALLOWED_IN_WINDOW) == 1) {
            return SecondFactorCodeReservation.RESERVED;
        }
        return jpa.pause(donorId.value(), now.plus(PAUSE)) == 1 ? SecondFactorCodeReservation.PAUSE_STARTED : SecondFactorCodeReservation.PAUSED;
    }

    @Override
    public void release(DonorId donorId) {
        jpa.release(donorId.value());
    }
}
