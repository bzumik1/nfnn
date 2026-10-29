package cz.novanadeje.app.shared.application.secondfactor;

import java.util.Objects;
import java.util.Optional;

public record FreshSecondFactorProof(Optional<String> code, Optional<PasskeyEvidence> passkey) {

    public FreshSecondFactorProof {
        Objects.requireNonNull(code, "code");
        Objects.requireNonNull(passkey, "passkey");
        code = code.filter(value -> !value.isBlank());
    }

    public record PasskeyEvidence(String challenge, String credentialId, String clientDataJson, String authenticatorData, String signature,
                                  String userHandle) {

        @Override
        public String toString() {
            return "PasskeyEvidence[***]";
        }
    }

    @Override
    public String toString() {
        return "FreshSecondFactorProof[code=***, passkey=***]";
    }
}
