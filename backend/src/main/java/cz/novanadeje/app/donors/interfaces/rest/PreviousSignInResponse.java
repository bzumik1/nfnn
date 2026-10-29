package cz.novanadeje.app.donors.interfaces.rest;

import java.time.Instant;
import java.util.Optional;

public record PreviousSignInResponse(Instant previousSignInAt) {

    static PreviousSignInResponse from(Optional<Instant> previousSignIn) {
        return new PreviousSignInResponse(previousSignIn.orElse(null));
    }
}
