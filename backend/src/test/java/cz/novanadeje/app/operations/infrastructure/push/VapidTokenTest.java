package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Instant;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

class VapidTokenTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    @DisplayName("Given the server's keys, when an authorization for an endpoint is made, then it is an ES256 JWT for the endpoint's origin, an hour long, naming the site, with the public key beside it")
    void should_make_an_es256_token_for_the_origin_when_authorized_given_the_keys() throws Exception {
        KeyPair pair = P256.generate();
        VapidKeys keys = new VapidKeys(encode(P256.uncompressed((ECPublicKey) pair.getPublic())), encode(P256.scalar((ECPrivateKey) pair.getPrivate())));
        PushEndpoint endpoint = new PushEndpoint("https://fcm.googleapis.com/fcm/send/abc:def");

        String authorization = VapidToken.authorization(keys, endpoint, "https://nfnn.cz", NOW);

        assertThat(authorization).startsWith("vapid t=").endsWith(", k=" + keys.publicKey());
        String token = authorization.substring("vapid t=".length(), authorization.indexOf(", k="));
        String[] parts = token.split("\\.");
        assertThat(parts).hasSize(3);
        JsonNode header = JSON.readTree(Base64.getUrlDecoder().decode(parts[0]));
        JsonNode claims = JSON.readTree(Base64.getUrlDecoder().decode(parts[1]));
        assertThat(header.get("alg").asString()).isEqualTo("ES256");
        assertThat(header.get("typ").asString()).isEqualTo("JWT");
        assertThat(claims.get("aud").asString()).isEqualTo("https://fcm.googleapis.com");
        assertThat(claims.get("exp").asLong()).isEqualTo(NOW.plusSeconds(3600).getEpochSecond());
        assertThat(claims.get("sub").asString()).isEqualTo("https://nfnn.cz");
        assertThat(claims.properties()).hasSize(3);
        byte[] signature = Base64.getUrlDecoder().decode(parts[2]);
        assertThat(signature).hasSize(64);
        Signature verifier = Signature.getInstance("SHA256withECDSAinP1363Format");
        verifier.initVerify(pair.getPublic());
        verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(verifier.verify(signature)).isTrue();
    }

    private static String encode(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
