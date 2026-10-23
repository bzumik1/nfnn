package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.PasskeyAttestation;
import cz.novanadeje.app.donors.domain.Passkey;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

record PasskeyRegistrationRequest(
        @NotBlank @Size(max = 43) String challenge,
        @NotBlank @Size(max = Passkey.MAX_NAME_LENGTH) String name,
        @NotNull @Valid Credential credential
) {

    record Credential(@NotBlank @Size(max = Passkey.MAX_CREDENTIAL_ID_LENGTH) String id, @NotNull @Valid Response response) {
    }

    record Response(
            @NotBlank @Size(max = 4096) String clientDataJSON,
            @NotBlank @Size(max = 16384) String attestationObject,
            @Size(max = 8) List<@NotBlank @Size(max = 16) String> transports
    ) {
    }

    PasskeyAttestation attestation() {
        return new PasskeyAttestation(credential.response().clientDataJSON(), credential.response().attestationObject(),
                credential.response().transports());
    }

    @Override
    public String toString() {
        return "PasskeyRegistrationRequest[challenge=***, credential=***]";
    }
}
