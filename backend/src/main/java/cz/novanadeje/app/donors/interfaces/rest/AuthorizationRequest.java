package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AuthorizationDecision;
import cz.novanadeje.app.donors.application.PasskeyProof;
import cz.novanadeje.app.donors.application.SecondFactorProof;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ClientMetadata;
import cz.novanadeje.app.donors.domain.Totp;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record AuthorizationRequest(
        @NotBlank @Size(max = ClientId.MAX_LENGTH) String clientId,
        @NotBlank @Size(max = ClientMetadata.MAX_REDIRECT_LENGTH) String redirectUri,
        @Size(max = 50) String responseType,
        @Size(max = 200) String codeChallenge,
        @Size(max = 20) String codeChallengeMethod,
        @Size(max = 200) String scope,
        @Size(max = ClientId.MAX_LENGTH) String resource,
        @Size(max = 1000) String state,
        @NotNull Boolean approved,
        @Pattern(regexp = Totp.CODE_SHAPE) String secondFactorCode,
        @Valid PasskeySignInRequest passkey) {

    boolean carriesCode() {
        return secondFactorCode != null;
    }

    AuthorizationDecision toDecision() {
        SecondFactorProof proof = new SecondFactorProof(secondFactorCode, passkey == null ? null : new PasskeyProof(passkey.challenge(), passkey.assertion()));
        return new AuthorizationDecision(clientId, redirectUri, responseType, codeChallenge, codeChallengeMethod, scope, resource, state, approved, proof);
    }

    @Override
    public String toString() {
        return "AuthorizationRequest[clientId=" + clientId + ", redirectUri=" + redirectUri + ", scope=" + scope + ", approved=" + approved
                + ", secondFactorCode=***, passkey=***]";
    }
}
