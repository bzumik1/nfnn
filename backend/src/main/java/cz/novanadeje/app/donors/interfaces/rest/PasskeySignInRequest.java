package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.PasskeyAssertion;
import cz.novanadeje.app.donors.domain.Passkey;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

record PasskeySignInRequest(@NotBlank @Size(max = 43) String challenge, @NotNull @Valid Credential credential) {

    record Credential(@NotBlank @Size(max = Passkey.MAX_CREDENTIAL_ID_LENGTH) String id, @NotNull @Valid Response response) {
    }

    record Response(
            @NotBlank @Size(max = 4096) String clientDataJSON,
            @NotBlank @Size(max = 4096) String authenticatorData,
            @NotBlank @Size(max = 1024) String signature,
            @NotBlank @Size(max = 128) String userHandle
    ) {
    }

    PasskeyAssertion assertion() {
        Response response = credential.response();
        return new PasskeyAssertion(credential.id(), response.clientDataJSON(), response.authenticatorData(), response.signature(),
                response.userHandle());
    }

    @Override
    public String toString() {
        return "PasskeySignInRequest[challenge=***, credential=***]";
    }
}
