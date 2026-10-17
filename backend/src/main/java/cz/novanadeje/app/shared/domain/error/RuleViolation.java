package cz.novanadeje.app.shared.domain.error;

public non-sealed class RuleViolation extends DomainException {

    public RuleViolation(String code, String message) {
        super(code, message);
    }
}
