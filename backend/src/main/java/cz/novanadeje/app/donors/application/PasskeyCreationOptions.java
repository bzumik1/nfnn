package cz.novanadeje.app.donors.application;

import java.time.Duration;
import java.util.List;

public record PasskeyCreationOptions(String challenge, String relyingPartyId, String relyingPartyName, String userHandle, String userName,
                                     String userDisplayName, List<Integer> algorithms, List<PasskeyDescriptor> excluded,
                                     Duration timeout) {
}
