package cz.novanadeje.app.donors.interfaces.rest;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import cz.novanadeje.app.donors.application.ExchangedAccessToken;
import cz.novanadeje.app.donors.application.OAuthTokens;
import cz.novanadeje.app.donors.domain.OAuthScope;

import java.time.Duration;
import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
record TokenResponse(
        @JsonProperty("access_token") String accessToken,
        @JsonProperty("token_type") String tokenType,
        @JsonProperty("expires_in") long expiresIn,
        @JsonProperty("refresh_token") String refreshToken,
        String scope,
        @JsonProperty("issued_token_type") String issuedTokenType) {

    private static final String BEARER = "Bearer";
    private static final String MASKED = "***";
    private static final String ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

    static TokenResponse of(OAuthTokens tokens, Instant now) {
        return new TokenResponse(tokens.accessToken(), BEARER, secondsUntil(tokens.accessTokenExpiresAt(), now), tokens.refreshToken(),
                OAuthScope.format(tokens.scopes()), null);
    }

    static TokenResponse exchanged(ExchangedAccessToken token, Instant now) {
        return new TokenResponse(token.accessToken(), BEARER, secondsUntil(token.expiresAt(), now), null, OAuthScope.format(token.scopes()),
                ACCESS_TOKEN_TYPE);
    }

    private static long secondsUntil(Instant expiresAt, Instant now) {
        return Math.max(0, Duration.between(now, expiresAt).toSeconds());
    }

    @Override
    public String toString() {
        return "TokenResponse[accessToken=" + MASKED + ", tokenType=" + tokenType + ", expiresIn=" + expiresIn + ", refreshToken="
                + (refreshToken == null ? "none" : MASKED) + ", scope=" + scope + ", issuedTokenType=" + issuedTokenType + "]";
    }
}
