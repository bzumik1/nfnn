package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.PasskeyAttestation;
import cz.novanadeje.app.donors.domain.Passkey;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record PasskeyRecoveryRequest(
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{43}$") String token,
        @NotBlank @Size(max = 43) String challenge,
        @NotBlank @Size(max = Passkey.MAX_NAME_LENGTH) String name,
        @NotNull @Valid PasskeyRegistrationRequest.Credential credential
) {

    PasskeyAttestation attestation() {
        return new PasskeyAttestation(credential.response().clientDataJSON(), credential.response().attestationObject(),
                credential.response().transports());
    }

    @Override
    public String toString() {
        return "PasskeyRecoveryRequest[token=***, challenge=***, credential=***]";
    }
}
