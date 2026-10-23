package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.Confirmation;
import cz.novanadeje.app.donors.application.PasskeyProof;

final class ConfirmationRequests {

    private ConfirmationRequests() {
    }

    static Confirmation of(String password, PasskeySignInRequest passkey) {
        return new Confirmation(password, passkey == null ? null : new PasskeyProof(passkey.challenge(), passkey.assertion()));
    }
}
