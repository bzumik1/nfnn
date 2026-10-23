package cz.novanadeje.app.donors.application;

import java.util.Optional;

public record Confirmation(String password, PasskeyProof passkey) {

    public static Confirmation none() {
        return new Confirmation(null, null);
    }

    public static Confirmation withPassword(String password) {
        return new Confirmation(password, null);
    }

    public static Confirmation withPasskey(PasskeyProof passkey) {
        return new Confirmation(null, passkey);
    }

    public Optional<String> givenPassword() {
        return Optional.ofNullable(password).filter(value -> !value.isEmpty());
    }

    public Optional<PasskeyProof> givenPasskey() {
        return Optional.ofNullable(passkey);
    }

    public boolean isEmpty() {
        return givenPassword().isEmpty() && passkey == null;
    }

    @Override
    public String toString() {
        return "Confirmation[password=***, passkey=***]";
    }
}
