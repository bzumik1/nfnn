package cz.novanadeje.app.donors.application;

import java.util.Optional;

public record SecondFactorProof(String code, PasskeyProof passkey) {

    public static SecondFactorProof none() {
        return new SecondFactorProof(null, null);
    }

    public static SecondFactorProof withCode(String code) {
        return new SecondFactorProof(code, null);
    }

    public static SecondFactorProof withPasskey(PasskeyProof passkey) {
        return new SecondFactorProof(null, passkey);
    }

    public Optional<String> givenCode() {
        return Optional.ofNullable(code).filter(value -> !value.isBlank());
    }

    public Optional<PasskeyProof> givenPasskey() {
        return Optional.ofNullable(passkey);
    }

    @Override
    public String toString() {
        return "SecondFactorProof[code=***, passkey=***]";
    }
}
