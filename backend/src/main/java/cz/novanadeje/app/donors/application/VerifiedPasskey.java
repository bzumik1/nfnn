package cz.novanadeje.app.donors.application;

import java.util.Arrays;
import java.util.List;

public record VerifiedPasskey(String credentialId, byte[] credentialData, long signCount, List<String> transports) {

    public VerifiedPasskey {
        credentialData = credentialData.clone();
    }

    @Override
    public byte[] credentialData() {
        return credentialData.clone();
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof VerifiedPasskey passkey && credentialId.equals(passkey.credentialId) && Arrays.equals(credentialData, passkey.credentialData)
                && signCount == passkey.signCount && transports.equals(passkey.transports);
    }

    @Override
    public int hashCode() {
        return credentialId.hashCode();
    }

    @Override
    public String toString() {
        return "VerifiedPasskey[" + credentialId + ", " + credentialData.length + " bytes, sign count " + signCount + ", transports " + transports + "]";
    }
}
