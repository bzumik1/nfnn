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
    private final boolean hmacSecret;
    private long signCount;

    private SoftwarePasskey(byte[] credentialId, byte[] userHandle, KeyPair keys, long signCount, boolean hmacSecret) {
        this.credentialId = credentialId;
        this.userHandle = userHandle;
        this.keys = keys;
        this.signCount = signCount;
        this.hmacSecret = hmacSecret;
    }

    public static SoftwarePasskey forUser(UUID donorId) {
        byte[] credentialId = new byte[32];
        RANDOM.nextBytes(credentialId);
        return new SoftwarePasskey(credentialId, uuidBytes(donorId), newKeys(), 0, false);
    }

    public SoftwarePasskey withAnotherKey() {
        return new SoftwarePasskey(credentialId, userHandle, newKeys(), signCount, hmacSecret);
    }

    public SoftwarePasskey counting() {
        return new SoftwarePasskey(credentialId, userHandle, keys, 1, hmacSecret);
    }

    public SoftwarePasskey withHmacSecretExtension() {
        return new SoftwarePasskey(credentialId, userHandle, keys, signCount, true);
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
        byte[] attestationObject = hmacSecret
                ? noneAttestation(withExtension(new AuthenticatorDataConverter(CONVERTER).convert(authenticatorData), HMAC_SECRET_CREATED))
                : new AttestationObjectConverter(CONVERTER)
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
        byte[] plainAuthenticatorData = new AuthenticatorDataConverter(CONVERTER)
                .convert(new AuthenticatorData<>(sha256(RP_ID.getBytes(StandardCharsets.UTF_8)), flags, signCount));
        byte[] authenticatorData = hmacSecret ? withExtension(plainAuthenticatorData, hmacSecretOutput()) : plainAuthenticatorData;
        byte[] clientData = clientData("webauthn.get", challenge, SITE);
        byte[] signed = ByteBuffer.allocate(authenticatorData.length + 32).put(authenticatorData).put(sha256(clientData)).array();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("clientDataJSON", base64Url(clientData));
        response.put("authenticatorData", base64Url(authenticatorData));
        response.put("signature", base64Url(sign(signed)));
        response.put("userHandle", base64Url(userHandle));
        return credential(response);
    }

    private static final int FLAGS_OFFSET = 32;
    private static final byte[] HMAC_SECRET_NAME = "hmac-secret".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] HMAC_SECRET_CREATED = cborMapOfOne(new byte[] {(byte) 0xF5});

    private static byte[] hmacSecretOutput() {
        byte[] output = new byte[48];
        RANDOM.nextBytes(output);
        return cborMapOfOne(ByteBuffer.allocate(2 + output.length).put((byte) 0x58).put((byte) output.length).put(output).array());
    }

    private static byte[] cborMapOfOne(byte[] value) {
        return ByteBuffer.allocate(2 + HMAC_SECRET_NAME.length + value.length)
                .put((byte) 0xA1).put((byte) (0x60 + HMAC_SECRET_NAME.length)).put(HMAC_SECRET_NAME).put(value).array();
    }

    private static byte[] withExtension(byte[] authenticatorData, byte[] extensions) {
        byte[] extended = ByteBuffer.allocate(authenticatorData.length + extensions.length).put(authenticatorData).put(extensions).array();
        extended[FLAGS_OFFSET] = (byte) (extended[FLAGS_OFFSET] | AuthenticatorData.BIT_ED);
        return extended;
    }

    private static byte[] noneAttestation(byte[] authenticatorData) {
        byte[] head = {(byte) 0xA3, 0x63, 'f', 'm', 't', 0x64, 'n', 'o', 'n', 'e', 0x67, 'a', 't', 't', 'S', 't', 'm', 't', (byte) 0xA0,
                0x68, 'a', 'u', 't', 'h', 'D', 'a', 't', 'a', 0x59};
        return ByteBuffer.allocate(head.length + 2 + authenticatorData.length)
                .put(head).putShort((short) authenticatorData.length).put(authenticatorData).array();
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
