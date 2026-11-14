package cz.novanadeje.app.operations.domain.release;

public enum ReleaseCheckFailure {
    STATUS,
    REFUSED_ANSWER,
    TOO_LARGE,
    TIMEOUT,
    UNREACHABLE,
    UNKNOWN_HOST,
    NON_PUBLIC_ADDRESS,
    NOT_HTTPS,
    INTERRUPTED
}
