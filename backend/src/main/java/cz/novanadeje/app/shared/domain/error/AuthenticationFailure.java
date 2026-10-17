package cz.novanadeje.app.shared.domain.error;

public non-sealed class AuthenticationFailure extends DomainException {

    public AuthenticationFailure(String code, String message) {
        super(code, message);
    }
}
