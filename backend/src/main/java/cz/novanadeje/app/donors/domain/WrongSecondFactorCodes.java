package cz.novanadeje.app.donors.domain;

import java.time.Duration;
import java.time.Instant;

public interface WrongSecondFactorCodes {

    int ALLOWED_IN_WINDOW = 10;
    Duration WINDOW = Duration.ofMinutes(15);
    Duration PAUSE = Duration.ofHours(1);

    SecondFactorCodeReservation reserve(DonorId donorId, Instant now);

    void release(DonorId donorId);
}
