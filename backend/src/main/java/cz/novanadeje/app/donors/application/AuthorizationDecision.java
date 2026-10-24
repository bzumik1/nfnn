package cz.novanadeje.app.donors.application;

public record AuthorizationDecision(String clientId, String redirectUri, String responseType, String codeChallenge, String codeChallengeMethod,
                                    String scope, String resource, String state, boolean approved,
                                    SecondFactorProof proof) {
}
