package cz.novanadeje.app.donations.application.pairing;

public class PairingRaceLost extends RuntimeException {

    public PairingRaceLost(Throwable cause) {
        super("Pairing lost a race with another writer", cause);
    }
}
