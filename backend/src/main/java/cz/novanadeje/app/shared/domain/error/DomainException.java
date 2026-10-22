package cz.novanadeje.app.shared.domain.error;

import java.util.Map;

public abstract sealed class DomainException extends RuntimeException
        permits RuleViolation, Conflict, NotFound, AuthenticationFailure, AccessDenied {

    private final String code;

    protected DomainException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }

    public String getCode() {
        return code;
    }

    public Map<String, Object> extensions() {
        return Map.of();
    }
}
