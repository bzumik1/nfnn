package cz.novanadeje.app.shared.domain.error;

public abstract non-sealed class Conflict extends DomainException {

    protected Conflict(String code, String message) {
        super(code, message);
    }
}
