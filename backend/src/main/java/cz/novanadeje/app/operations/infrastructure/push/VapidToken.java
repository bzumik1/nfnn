package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.Signature;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

final class VapidToken {

    static final Duration LIFETIME = Duration.ofHours(1);
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Base64.Encoder BASE64URL = Base64.getUrlEncoder().withoutPadding();
    private static final String HEADER = BASE64URL.encodeToString("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.US_ASCII));

    private VapidToken() {
    }

    static String authorization(VapidKeys keys, PushEndpoint endpoint, String subject, Instant now) {
        ObjectNode claims = JSON.createObjectNode()
                .put("aud", endpoint.origin())
                .put("exp", now.plus(LIFETIME).getEpochSecond())
                .put("sub", subject);
        String signed = HEADER + "." + BASE64URL.encodeToString(JSON.writeValueAsBytes(claims));
        return "vapid t=" + signed + "." + BASE64URL.encodeToString(sign(keys, signed)) + ", k=" + keys.publicKey();
    }

    private static byte[] sign(VapidKeys keys, String signed) {
        try {
            Signature signature = Signature.getInstance("SHA256withECDSAinP1363Format");
            signature.initSign(P256.privateKey(Base64.getUrlDecoder().decode(keys.privateKey())));
            signature.update(signed.getBytes(StandardCharsets.US_ASCII));
            return signature.sign();
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("The VAPID token could not be signed", failure);
        }
    }
}
