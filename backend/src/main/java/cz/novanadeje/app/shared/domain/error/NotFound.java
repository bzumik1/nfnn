package cz.novanadeje.app.shared.domain.error;

public abstract non-sealed class NotFound extends DomainException {

    protected NotFound(String code, String message) {
        super(code, message);
    }
}
