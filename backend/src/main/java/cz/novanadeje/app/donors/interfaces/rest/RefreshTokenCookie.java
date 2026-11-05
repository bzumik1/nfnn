package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.SessionCookie;
import cz.novanadeje.app.donors.domain.SessionKind;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseCookie;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Optional;

final class RefreshTokenCookie {

    static final String NAME = "refresh_token";
    static final String APP_NAME = "refresh_token_app";
    static final String PATH = "/api/donors/auth";
    static final String SESSION_HEADER = "Nfnn-Session";

    private RefreshTokenCookie() {
    }

    static ResponseCookie carrying(String secret, Instant expiresAt, Instant now, SessionKind kind) {
        ResponseCookie.ResponseCookieBuilder cookie = builder(nameOf(SessionCookie.of(kind)), secret);
        if (kind.outlivesTheBrowser()) {
            cookie.maxAge(Duration.between(now, expiresAt));
        }
        return cookie.build();
    }

    static ResponseCookie cleared() {
        return cleared(SessionCookie.BROWSER);
    }

    static ResponseCookie cleared(SessionCookie cookie) {
        return builder(nameOf(cookie), "").maxAge(Duration.ZERO).build();
    }

    static SessionCookie presentedIn(HttpServletRequest request) {
        return SessionKind.APP.name().equals(request.getHeader(SESSION_HEADER)) ? SessionCookie.APP : SessionCookie.BROWSER;
    }

    static Optional<String> read(HttpServletRequest request, SessionCookie presentedIn) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        String name = nameOf(presentedIn);
        return Arrays.stream(cookies)
                .filter(cookie -> name.equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst();
    }

    private static String nameOf(SessionCookie cookie) {
        return cookie == SessionCookie.APP ? APP_NAME : NAME;
    }

    private static ResponseCookie.ResponseCookieBuilder builder(String name, String value) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .path(PATH);
    }
}
