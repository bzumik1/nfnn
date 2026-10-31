package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof.PasskeyEvidence;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Optional;

public record FreshSecondFactorRequest(@Pattern(regexp = CODE_SHAPE) String secondFactorCode, @Valid Passkey passkey) {

    public static final String CODE_SHAPE = "^[0-9]{6}$";

    public record Passkey(@NotBlank @Size(max = 43) String challenge, @NotNull @Valid Credential credential) {
    }

    public record Credential(@NotBlank @Size(max = 1366) String id, @NotNull @Valid Response response) {
    }

    public record Response(
            @NotBlank @Size(max = 4096) String clientDataJSON,
            @NotBlank @Size(max = 4096) String authenticatorData,
            @NotBlank @Size(max = 1024) String signature,
            @NotBlank @Size(max = 128) String userHandle
    ) {
    }

    public FreshSecondFactorProof toProof() {
        Optional<PasskeyEvidence> evidence = Optional.ofNullable(passkey).map(given -> new PasskeyEvidence(given.challenge(), given.credential().id(),
                given.credential().response().clientDataJSON(), given.credential().response().authenticatorData(),
                given.credential().response().signature(), given.credential().response().userHandle()));
        return new FreshSecondFactorProof(Optional.ofNullable(secondFactorCode), evidence);
    }

    @Override
    public String toString() {
        return "FreshSecondFactorRequest[secondFactorCode=***, passkey=***]";
    }
}
