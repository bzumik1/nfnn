package cz.novanadeje.app.donors.infrastructure.webauthn;

import com.webauthn4j.WebAuthnManager;
import com.webauthn4j.converter.AttestedCredentialDataConverter;
import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.credential.CredentialRecordImpl;
import com.webauthn4j.data.AuthenticationData;
import com.webauthn4j.data.AuthenticationParameters;
import com.webauthn4j.data.AuthenticationRequest;
import com.webauthn4j.data.PublicKeyCredentialParameters;
import com.webauthn4j.data.PublicKeyCredentialType;
import com.webauthn4j.data.RegistrationData;
import com.webauthn4j.data.RegistrationParameters;
import com.webauthn4j.data.RegistrationRequest;
import com.webauthn4j.data.attestation.authenticator.AttestedCredentialData;
import com.webauthn4j.data.attestation.authenticator.AuthenticatorData;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import com.webauthn4j.data.client.Origin;
import com.webauthn4j.data.client.challenge.DefaultChallenge;
import com.webauthn4j.server.ServerProperty;
import com.webauthn4j.util.exception.WebAuthnException;
import cz.novanadeje.app.donors.application.PasskeyAssertion;
import cz.novanadeje.app.donors.application.PasskeyAttestation;
import cz.novanadeje.app.donors.application.PasskeyCeremonies;
import cz.novanadeje.app.donors.application.VerifiedPasskey;
import cz.novanadeje.app.donors.domain.InvalidPasskey;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyRejected;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
class WebAuthnPasskeyCeremonies implements PasskeyCeremonies {

    static final List<COSEAlgorithmIdentifier> ALGORITHMS = List.of(COSEAlgorithmIdentifier.ES256, COSEAlgorithmIdentifier.EdDSA,
            COSEAlgorithmIdentifier.RS256);

    private static final Logger log = LoggerFactory.getLogger(WebAuthnPasskeyCeremonies.class);
    private static final Base64.Decoder BASE64URL = Base64.getUrlDecoder();
    private static final Base64.Encoder BASE64URL_ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final WebAuthnManager webAuthn;
    private final AttestedCredentialDataConverter credentialDataConverter;
    private final Origin origin;
    private final String relyingPartyId;
    private final List<PublicKeyCredentialParameters> algorithms;

    WebAuthnPasskeyCeremonies(PublicUrlProperties publicUrl) {
        ObjectConverter objectConverter = new ObjectConverter();
        this.webAuthn = WebAuthnManager.createNonStrictWebAuthnManager(objectConverter);
        this.credentialDataConverter = new AttestedCredentialDataConverter(objectConverter);
        URI site = URI.create(publicUrl.publicUrl());
        this.relyingPartyId = site.getHost();
        this.origin = new Origin(site.getScheme() + "://" + site.getRawAuthority());
        this.algorithms = ALGORITHMS.stream().map(alg -> new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, alg)).toList();
    }

    @Override
    public String relyingPartyId() {
        return relyingPartyId;
    }

    @Override
    public List<Integer> algorithms() {
        return ALGORITHMS.stream().map(alg -> (int) alg.getValue()).toList();
    }

    @Override
    public VerifiedPasskey verifyRegistration(PasskeyAttestation attestation, LinkSecret challenge) {
        try {
            RegistrationRequest request = new RegistrationRequest(decode(attestation.attestationObject()), decode(attestation.clientDataJson()),
                    new HashSet<>(attestation.transports()));
            RegistrationData data = webAuthn.verify(request, new RegistrationParameters(serverProperty(challenge), algorithms, true, true));
            AuthenticatorData<?> authenticatorData = data.getAttestationObject().getAuthenticatorData();
            AttestedCredentialData credential = authenticatorData.getAttestedCredentialData();
            return new VerifiedPasskey(BASE64URL_ENCODER.encodeToString(credential.getCredentialId()), credentialDataConverter.convert(credential),
                    authenticatorData.getSignCount(), attestation.transports());
        } catch (WebAuthnException | IllegalArgumentException | NullPointerException refused) {
            log.warn("A new passkey was refused: {}", refused.getClass().getSimpleName());
            throw new PasskeyRejected();
        }
    }

    @Override
    public long verifySignIn(PasskeyAssertion assertion, LinkSecret challenge, Passkey passkey) {
        try {
            AuthenticationRequest request = new AuthenticationRequest(decode(assertion.credentialId()), decode(assertion.userHandle()),
                    decode(assertion.authenticatorData()), decode(assertion.clientDataJson()), null, decode(assertion.signature()));
            CredentialRecordImpl record = new CredentialRecordImpl(null, null, null, null, passkey.signCount(),
                    credentialDataConverter.convert(passkey.credentialData()), null, null, null, null);
            AuthenticationData data = webAuthn.verify(request, new AuthenticationParameters(serverProperty(challenge), record, null, true, true));
            return data.getAuthenticatorData().getSignCount();
        } catch (WebAuthnException | IllegalArgumentException | NullPointerException refused) {
            log.warn("A passkey sign-in with passkey {} was refused: {}", passkey.id(), refused.getClass().getSimpleName());
            throw new InvalidPasskey();
        }
    }

    private ServerProperty serverProperty(LinkSecret challenge) {
        return ServerProperty.builder()
                .origin(origin)
                .rpId(relyingPartyId)
                .challenge(new DefaultChallenge(decode(challenge.value())))
                .build();
    }

    private static byte[] decode(String base64url) {
        if (base64url == null) {
            throw new IllegalArgumentException("A WebAuthn field is missing");
        }
        return BASE64URL.decode(base64url);
    }
}
