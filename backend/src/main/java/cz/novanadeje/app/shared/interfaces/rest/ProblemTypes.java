package cz.novanadeje.app.shared.interfaces.rest;

import java.net.URI;

public final class ProblemTypes {

    private static final String BASE = "https://novanadeje.cz/problems/";

    public static final URI VALIDATION = of("validation");
    public static final URI UNAUTHENTICATED = of("auth", "unauthenticated");
    public static final URI EXPIRED_TOKEN = of("auth", "expired-token");
    public static final URI FORBIDDEN = of("auth", "forbidden");

    private ProblemTypes() {
    }

    public static URI of(String context, String code) {
        return URI.create(BASE + context + "/" + code);
    }

    public static URI of(String code) {
        return URI.create(BASE + code);
    }
}
