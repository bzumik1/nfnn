package cz.novanadeje.app.donors.application;

import java.util.List;

public record VerifiedPasskey(String credentialId, byte[] credentialData, long signCount, List<String> transports) {
}
