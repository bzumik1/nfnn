package cz.novanadeje.app.shared.infrastructure.ratelimit;

public record SubjectKey(String value) implements RateLimitKey {

    public SubjectKey {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("A subject key needs the signed-in subject");
        }
    }
}
