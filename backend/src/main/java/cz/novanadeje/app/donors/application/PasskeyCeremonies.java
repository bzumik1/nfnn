package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.Passkey;

import java.util.List;

public interface PasskeyCeremonies {

    String relyingPartyId();

    List<Integer> algorithms();

    VerifiedPasskey verifyRegistration(PasskeyAttestation attestation, LinkSecret challenge);

    long verifySignIn(PasskeyAssertion assertion, LinkSecret challenge, Passkey passkey);
}
