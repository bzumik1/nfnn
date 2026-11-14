package cz.novanadeje.app.donors.application;

public record PasskeyAssertion(String credentialId, String clientDataJson, String authenticatorData, String signature, String userHandle) {

    @Override
    public String toString() {
        return "PasskeyAssertion[***]";
    }
}
