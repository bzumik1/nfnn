package cz.novanadeje.app.donors.application;

public record CodeExchange(String code, String clientId, String redirectUri, String codeVerifier, String resource) {
}
