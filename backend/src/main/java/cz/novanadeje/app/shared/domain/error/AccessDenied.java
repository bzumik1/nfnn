package cz.novanadeje.app.shared.domain.error;

public non-sealed class AccessDenied extends DomainException {

    public AccessDenied(String code, String message) {
        super(code, message);
    }
}
