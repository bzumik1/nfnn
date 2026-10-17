package cz.novanadeje.app.shared.domain.error;

public non-sealed class Conflict extends DomainException {

    public Conflict(String code, String message) {
        super(code, message);
    }
}
