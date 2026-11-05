package cz.novanadeje.app.shared.infrastructure.ratelimit;

public sealed interface RateLimitKey permits ClientAddressKey, SubjectKey {
}
