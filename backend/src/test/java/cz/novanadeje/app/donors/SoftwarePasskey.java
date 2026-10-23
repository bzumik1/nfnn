package cz.novanadeje.app.donors;

import com.webauthn4j.converter.AttestationObjectConverter;
import com.webauthn4j.converter.AuthenticatorDataConverter;
import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.data.attestation.AttestationObject;
import com.webauthn4j.data.attestation.authenticator.AAGUID;
import com.webauthn4j.data.attestation.authenticator.AttestedCredentialData;
import com.webauthn4j.data.attestation.authenticator.AuthenticatorData;
import com.webauthn4j.data.attestation.authenticator.EC2COSEKey;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import com.webauthn4j.data.attestation.statement.NoneAttestationStatement;
import com.webauthn4j.data.extension.authenticator.RegistrationExtensionAuthenticatorOutput;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class SoftwarePasskey {

    public static final String SITE = "http://localhost:4200";
    public static final String RP_ID = "localhost";

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final ObjectConverter CONVERTER = new ObjectConverter();
    private static final AAGUID AAGUID_OF_TESTS = new AAGUID(UUID.fromString("00000000-0000-4000-8000-00000000c0de"));

    private final byte[] credentialId;
    private final byte[] userHandle;
    private final KeyPair keys;
    private long signCount;

    private SoftwarePasskey(byte[] credentialId, byte[] userHandle, KeyPair keys, long signCount) {
        this.credentialId = credentialId;
        this.userHandle = userHandle;
        this.keys = keys;
        this.signCount = signCount;
    }

    public static SoftwarePasskey forUser(UUID donorId) {
        byte[] credentialId = new byte[32];
        RANDOM.nextBytes(credentialId);
        return new SoftwarePasskey(credentialId, uuidBytes(donorId), newKeys(), 0);
    }

    public SoftwarePasskey withAnotherKey() {
        return new SoftwarePasskey(credentialId, userHandle, newKeys(), signCount);
    }

    public SoftwarePasskey counting() {
        return new SoftwarePasskey(credentialId, userHandle, keys, 1);
    }

    public String credentialId() {
        return base64Url(credentialId);
    }

    public Map<String, Object> registration(String challenge) {
        return registration(challenge, SITE, true);
    }

    public Map<String, Object> registration(String challenge, String origin, boolean userVerified) {
        byte flags = (byte) (AuthenticatorData.BIT_UP | AuthenticatorData.BIT_AT | (userVerified ? AuthenticatorData.BIT_UV : 0));
        AttestedCredentialData attested = new AttestedCredentialData(AAGUID_OF_TESTS, credentialId,
                EC2COSEKey.create((ECPublicKey) keys.getPublic(), COSEAlgorithmIdentifier.ES256));
        AuthenticatorData<RegistrationExtensionAuthenticatorOutput> authenticatorData =
                new AuthenticatorData<>(sha256(RP_ID.getBytes(StandardCharsets.UTF_8)), flags, signCount, attested);
        byte[] attestationObject = new AttestationObjectConverter(CONVERTER)
                .convertToBytes(new AttestationObject(authenticatorData, new NoneAttestationStatement()));
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("clientDataJSON", base64Url(clientData("webauthn.create", challenge, origin)));
        response.put("attestationObject", base64Url(attestationObject));
        response.put("transports", List.of("internal", "hybrid"));
        return credential(response);
    }

    public Map<String, Object> assertion(String challenge) {
        return assertion(challenge, true);
    }

    public Map<String, Object> assertion(String challenge, boolean userVerified) {
        if (signCount > 0) {
            signCount++;
        }
        byte flags = (byte) (AuthenticatorData.BIT_UP | (userVerified ? AuthenticatorData.BIT_UV : 0));
        byte[] authenticatorData = new AuthenticatorDataConverter(CONVERTER)
                .convert(new AuthenticatorData<>(sha256(RP_ID.getBytes(StandardCharsets.UTF_8)), flags, signCount));
        byte[] clientData = clientData("webauthn.get", challenge, SITE);
        byte[] signed = ByteBuffer.allocate(authenticatorData.length + 32).put(authenticatorData).put(sha256(clientData)).array();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("clientDataJSON", base64Url(clientData));
        response.put("authenticatorData", base64Url(authenticatorData));
        response.put("signature", base64Url(sign(signed)));
        response.put("userHandle", base64Url(userHandle));
        return credential(response);
    }

    private Map<String, Object> credential(Map<String, Object> response) {
        Map<String, Object> credential = new LinkedHashMap<>();
        credential.put("id", credentialId());
        credential.put("rawId", credentialId());
        credential.put("type", "public-key");
        credential.put("response", response);
        credential.put("clientExtensionResults", Map.of());
        credential.put("authenticatorAttachment", "platform");
        return credential;
    }

    private byte[] sign(byte[] data) {
        try {
            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign(keys.getPrivate());
            signature.update(data);
            return signature.sign();
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static byte[] clientData(String type, String challenge, String origin) {
        String json = "{\"type\":\"" + type + "\",\"challenge\":\"" + challenge + "\",\"origin\":\"" + origin + "\",\"crossOrigin\":false}";
        return json.getBytes(StandardCharsets.UTF_8);
    }

    private static KeyPair newKeys() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            return generator.generateKeyPair();
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static byte[] sha256(byte[] data) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(data);
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static byte[] uuidBytes(UUID id) {
        return ByteBuffer.allocate(16).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits()).array();
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
