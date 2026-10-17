package cz.novanadeje.app.donors.interfaces.rest;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseCookie;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Optional;

final class RefreshTokenCookie {

    static final String NAME = "refresh_token";
    static final String PATH = "/api/donors/auth";

    private RefreshTokenCookie() {
    }

    static ResponseCookie carrying(String secret, Instant expiresAt, Instant now) {
        return build(secret, Duration.between(now, expiresAt));
    }

    static ResponseCookie cleared() {
        return build("", Duration.ZERO);
    }

    static Optional<String> read(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        return Arrays.stream(cookies)
                .filter(cookie -> NAME.equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst();
    }

    private static ResponseCookie build(String value, Duration maxAge) {
        return ResponseCookie.from(NAME, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .path(PATH)
                .maxAge(maxAge)
                .build();
    }
}
