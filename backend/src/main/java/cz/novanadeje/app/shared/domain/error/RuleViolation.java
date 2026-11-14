package cz.novanadeje.app.shared.domain.error;

public abstract non-sealed class RuleViolation extends DomainException {

    protected RuleViolation(String code, String message) {
        super(code, message);
    }
}
