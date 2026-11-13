package cz.novanadeje.app.shared.domain.error;

public abstract non-sealed class AuthenticationFailure extends DomainException {

    protected AuthenticationFailure(String code, String message) {
        super(code, message);
    }
}
