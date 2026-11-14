package cz.novanadeje.app.donors.application;

import java.time.Duration;

public record PasskeySignInOptions(String challenge, String relyingPartyId, Duration timeout) {

    @Override
    public String toString() {
        return "PasskeySignInOptions[challenge=***, relyingPartyId=" + relyingPartyId + ", timeout=" + timeout + "]";
    }
}
