package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.PasskeySignInOptions;

import java.util.List;

record PasskeySignInOptionsResponse(String challenge, String rpId, long timeout, String userVerification, List<Object> allowCredentials) {

    static PasskeySignInOptionsResponse of(PasskeySignInOptions options) {
        return new PasskeySignInOptionsResponse(options.challenge(), options.relyingPartyId(), options.timeout().toMillis(), "required", List.of());
    }
}
