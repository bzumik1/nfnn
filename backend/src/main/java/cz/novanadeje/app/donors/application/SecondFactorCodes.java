package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.InvalidSecondFactorCode;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
public class SecondFactorCodes {

    private final SecondFactorRepository secondFactors;
    private final WrongSecondFactorCodeCount wrongCodes;

    public SecondFactorCodes(SecondFactorRepository secondFactors, WrongSecondFactorCodeCount wrongCodes) {
        this.secondFactors = secondFactors;
        this.wrongCodes = wrongCodes;
    }

    public void verify(SecondFactor factor, String code, Instant now) {
        wrongCodes.reserve(factor.donorId(), now);
        factor.verify(code, now);
        if (!secondFactors.recordUse(factor)) {
            throw new InvalidSecondFactorCode();
        }
        wrongCodes.release(factor.donorId());
    }

    public void check(SecondFactor factor, String code, Instant now) {
        try {
            verify(factor, code, now);
        } catch (InvalidSecondFactorCode wrong) {
            throw new SecondFactorCodeRejected();
        }
    }

    public void confirm(SecondFactor factor, String code, Instant now) {
        wrongCodes.reserve(factor.donorId(), now);
        factor.confirm(code, now);
        wrongCodes.release(factor.donorId());
    }
}
