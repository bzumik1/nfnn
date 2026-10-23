package cz.novanadeje.app.donors.application;

public record PasskeyProof(String challenge, PasskeyAssertion assertion) {

    @Override
    public String toString() {
        return "PasskeyProof[challenge=***, assertion=***]";
    }
}
