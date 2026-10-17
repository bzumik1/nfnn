package cz.novanadeje.app.shared.domain.error;

public non-sealed class NotFound extends DomainException {

    public NotFound(String code, String message) {
        super(code, message);
    }
}
