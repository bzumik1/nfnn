package cz.novanadeje.app.donors.application;

import java.util.List;

public record PasskeyAttestation(String clientDataJson, String attestationObject, List<String> transports) {

    public PasskeyAttestation {
        transports = transports == null ? List.of() : List.copyOf(transports);
    }

    @Override
    public String toString() {
        return "PasskeyAttestation[clientDataJson=***, attestationObject=***, transports=" + transports + "]";
    }
}
