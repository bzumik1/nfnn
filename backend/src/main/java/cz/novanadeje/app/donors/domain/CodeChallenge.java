package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.Sha256;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.regex.Pattern;

public record CodeChallenge(String value, String method) {

    public static final String S256 = "S256";
    private static final Pattern SHAPE = Pattern.compile("^[A-Za-z0-9_-]{43}$");

    public CodeChallenge {
        if (!S256.equals(method)) {
            throw new InvalidAuthorizationRequest("code_challenge_method must be S256");
        }
        if (value == null || !SHAPE.matcher(value).matches()) {
            throw new InvalidAuthorizationRequest("code_challenge must be the base64url SHA-256 of the verifier");
        }
    }

    public boolean matches(String codeVerifier) {
        if (codeVerifier == null || codeVerifier.isBlank()) {
            return false;
        }
        return MessageDigest.isEqual(value.getBytes(StandardCharsets.US_ASCII), challengeOf(codeVerifier).getBytes(StandardCharsets.US_ASCII));
    }

    private static String challengeOf(String codeVerifier) {
        return Sha256.base64Url(codeVerifier.getBytes(StandardCharsets.US_ASCII));
    }
}
