package cz.novanadeje.app.donors.application;

import java.util.List;

public record PasskeyDescriptor(String credentialId, List<String> transports) {
}
