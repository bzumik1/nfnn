package cz.novanadeje.app.donors.interfaces.rest;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record SecondFactorRecoveryRequest(@NotBlank @Size(max = 43) String challenge) {

    @Override
    public String toString() {
        return "SecondFactorRecoveryRequest[challenge=***]";
    }
}
