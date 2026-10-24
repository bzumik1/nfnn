package cz.novanadeje.app.donors.infrastructure.webauthn;

import cz.novanadeje.app.donors.SoftwarePasskey;
import cz.novanadeje.app.donors.application.PasskeyAssertion;
import cz.novanadeje.app.donors.application.PasskeyAttestation;
import cz.novanadeje.app.donors.application.VerifiedPasskey;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.InvalidPasskey;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyRejected;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WebAuthnPasskeyCeremoniesTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);

    private final WebAuthnPasskeyCeremonies ceremonies = new WebAuthnPasskeyCeremonies(new PublicUrlProperties(SoftwarePasskey.SITE));

    @Test
    @DisplayName("Given a public address with a port and a path, when the relying party is named, then it is the bare host")
    void should_name_the_host_as_relying_party_when_the_address_has_port_and_path() {
        assertThat(ceremonies.relyingPartyId()).isEqualTo("localhost");
        assertThat(new WebAuthnPasskeyCeremonies(new PublicUrlProperties("https://nfnn.cz/")).relyingPartyId()).isEqualTo("nfnn.cz");
    }

    @Test
    @DisplayName("Given a passkey created for this site and challenge with user verification, when it is registered and signs in, then both pass")
    void should_verify_registration_and_sign_in_when_the_passkey_answers_the_challenges() {
        SoftwarePasskey device = SoftwarePasskey.forUser(DONOR.value()).counting();
        LinkSecret registration = LinkSecret.generate();

        VerifiedPasskey verified = ceremonies.verifyRegistration(attestation(device.registration(registration.value())), registration);
        Passkey passkey = Passkey.register(DONOR, verified.credentialId(), verified.credentialData(), verified.signCount(), verified.transports(),
                "Mac", "nfnn.cz", NOW);
        LinkSecret signIn = LinkSecret.generate();
        long signCount = ceremonies.verifySignIn(assertion(device.assertion(signIn.value())), signIn, passkey);

        assertThat(verified.credentialId()).isEqualTo(device.credentialId());
        assertThat(verified.signCount()).isEqualTo(1);
        assertThat(verified.transports()).containsExactly("internal", "hybrid");
        assertThat(signCount).isEqualTo(2);
    }

    @Test
    @DisplayName("Given a passkey made for another site, another challenge or without user verification, when it is registered, then it is rejected")
    void should_reject_registration_when_site_challenge_or_verification_do_not_match() {
        SoftwarePasskey device = SoftwarePasskey.forUser(DONOR.value());
        LinkSecret challenge = LinkSecret.generate();

        assertThatThrownBy(() -> ceremonies.verifyRegistration(attestation(device.registration(challenge.value(), "https://nfnn-podvod.cz", true)),
                challenge)).isInstanceOf(PasskeyRejected.class);
        assertThatThrownBy(() -> ceremonies.verifyRegistration(attestation(device.registration(LinkSecret.generate().value())), challenge))
                .isInstanceOf(PasskeyRejected.class);
        assertThatThrownBy(() -> ceremonies.verifyRegistration(attestation(device.registration(challenge.value(), SoftwarePasskey.SITE, false)),
                challenge)).isInstanceOf(PasskeyRejected.class);
        assertThatThrownBy(() -> ceremonies.verifyRegistration(new PasskeyAttestation("not base64!", "AAAA", List.of()), challenge))
                .isInstanceOf(PasskeyRejected.class);
    }

    @Test
    @DisplayName("Given a stored passkey, when a sign-in is signed by another key, answers another challenge or repeats an old counter, then it is invalid")
    void should_refuse_sign_in_when_key_challenge_or_counter_do_not_match() {
        SoftwarePasskey device = SoftwarePasskey.forUser(DONOR.value()).counting();
        LinkSecret registration = LinkSecret.generate();
        VerifiedPasskey verified = ceremonies.verifyRegistration(attestation(device.registration(registration.value())), registration);
        Passkey passkey = Passkey.register(DONOR, verified.credentialId(), verified.credentialData(), 5, verified.transports(), "Mac", "nfnn.cz", NOW);
        LinkSecret signIn = LinkSecret.generate();

        assertThatThrownBy(() -> ceremonies.verifySignIn(assertion(device.withAnotherKey().assertion(signIn.value())), signIn, passkey))
                .isInstanceOf(InvalidPasskey.class);
        assertThatThrownBy(() -> ceremonies.verifySignIn(assertion(device.assertion(LinkSecret.generate().value())), signIn, passkey))
                .isInstanceOf(InvalidPasskey.class);
        assertThatThrownBy(() -> ceremonies.verifySignIn(assertion(device.assertion(signIn.value())), signIn, passkey))
                .isInstanceOf(InvalidPasskey.class);
        assertThatThrownBy(() -> ceremonies.verifySignIn(assertion(device.assertion(signIn.value(), false)), signIn, passkey))
                .isInstanceOf(InvalidPasskey.class);
    }

    @SuppressWarnings("unchecked")
    private static PasskeyAttestation attestation(Map<String, Object> credential) {
        Map<String, Object> response = (Map<String, Object>) credential.get("response");
        return new PasskeyAttestation((String) response.get("clientDataJSON"), (String) response.get("attestationObject"),
                (List<String>) response.get("transports"));
    }

    @SuppressWarnings("unchecked")
    private static PasskeyAssertion assertion(Map<String, Object> credential) {
        Map<String, Object> response = (Map<String, Object>) credential.get("response");
        return new PasskeyAssertion((String) credential.get("id"), (String) response.get("clientDataJSON"),
                (String) response.get("authenticatorData"), (String) response.get("signature"), (String) response.get("userHandle"));
    }
}
