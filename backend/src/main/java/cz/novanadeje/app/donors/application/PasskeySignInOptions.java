package cz.novanadeje.app.donors.application;

import java.time.Duration;

public record PasskeySignInOptions(String challenge, String relyingPartyId, Duration timeout) {
}
