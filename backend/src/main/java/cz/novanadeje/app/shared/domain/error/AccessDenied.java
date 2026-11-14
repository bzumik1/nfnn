package cz.novanadeje.app.shared.domain.error;

public abstract non-sealed class AccessDenied extends DomainException {

    protected AccessDenied(String code, String message) {
        super(code, message);
    }
}
