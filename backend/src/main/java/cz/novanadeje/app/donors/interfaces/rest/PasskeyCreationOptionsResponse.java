package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.PasskeyCreationOptions;

import java.util.List;

record PasskeyCreationOptionsResponse(String challenge, RelyingParty rp, User user, List<Parameter> pubKeyCredParams, long timeout,
                                      List<Descriptor> excludeCredentials, Selection authenticatorSelection, String attestation) {

    private static final String PUBLIC_KEY = "public-key";
    private static final String REQUIRED = "required";

    record RelyingParty(String id, String name) {
    }

    record User(String id, String name, String displayName) {
    }

    record Parameter(String type, int alg) {
    }

    record Descriptor(String type, String id, List<String> transports) {
    }

    record Selection(String residentKey, boolean requireResidentKey, String userVerification) {
    }

    static PasskeyCreationOptionsResponse of(PasskeyCreationOptions options) {
        return new PasskeyCreationOptionsResponse(
                options.challenge(),
                new RelyingParty(options.relyingPartyId(), options.relyingPartyName()),
                new User(options.userHandle(), options.userName(), options.userDisplayName()),
                options.algorithms().stream().map(alg -> new Parameter(PUBLIC_KEY, alg)).toList(),
                options.timeout().toMillis(),
                options.excluded().stream().map(passkey -> new Descriptor(PUBLIC_KEY, passkey.credentialId(), passkey.transports())).toList(),
                new Selection(REQUIRED, true, REQUIRED),
                "none");
    }
}
