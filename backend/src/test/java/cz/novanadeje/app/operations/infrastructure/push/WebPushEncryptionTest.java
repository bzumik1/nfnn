package cz.novanadeje.app.operations.infrastructure.push;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WebPushEncryptionTest {

    static final String PLAINTEXT = "When I grow up, I want to be a watermelon";
    static final String AUTH_SECRET = "BTBZMqHH6r4Tts7J_aSIgg";
    static final String RECEIVER_PRIVATE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94";
    static final String RECEIVER_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    static final String SENDER_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    static final String SENDER_PUBLIC = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    static final String SALT = "DGv6ra1nlYgDCS1FRnbzlw";
    static final String BODY = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml"
            + "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT"
            + "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

    @Test
    @DisplayName("Given the keys, salt and authentication secret of RFC 8291 section 5, when the example is encrypted, then the body is the RFC's byte for byte")
    void should_give_the_rfc_body_when_encrypted_given_the_rfc_example() {
        KeyPair sender = P256.keyPair(decode(SENDER_PRIVATE), decode(SENDER_PUBLIC));
        WebPushEncryption encryption = new WebPushEncryption(() -> sender, () -> decode(SALT));

        byte[] body = encryption.encrypt(decode(RECEIVER_PUBLIC), decode(AUTH_SECRET), PLAINTEXT.getBytes(StandardCharsets.US_ASCII));

        assertThat(Base64.getUrlEncoder().withoutPadding().encodeToString(body)).isEqualTo(BODY);
    }

    @Test
    @DisplayName("Given the intermediate values of RFC 8291 Appendix A, when the keys are derived, then the shared secret, the IKM, the PRK, the CEK and the nonce are the RFC's")
    void should_derive_the_rfc_intermediate_values_when_derived_given_the_rfc_example() {
        KeyPair sender = P256.keyPair(decode(SENDER_PRIVATE), decode(SENDER_PUBLIC));

        WebPushEncryption.Derived derived = WebPushEncryption.derive(sender, decode(RECEIVER_PUBLIC), decode(AUTH_SECRET), decode(SALT));

        assertThat(encode(derived.ecdhSecret())).isEqualTo("kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs");
        assertThat(encode(derived.ikm())).isEqualTo("S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg");
        assertThat(encode(derived.contentEncryptionKey())).isEqualTo("oIhVW04MRdy2XN9CiKLxTg");
        assertThat(encode(derived.nonce())).isEqualTo("4h_95klXJ5E_qnoN");
    }

    @Test
    @DisplayName("Given a fresh sender key and salt each time, when the same message is encrypted twice, then the receiver reads it back and the bodies differ")
    void should_round_trip_and_differ_when_encrypted_twice_given_random_keys() {
        WebPushEncryption encryption = WebPushEncryption.random();
        byte[] message = "{\"v\":1,\"kind\":\"test\",\"count\":0}".getBytes(StandardCharsets.UTF_8);

        byte[] first = encryption.encrypt(decode(RECEIVER_PUBLIC), decode(AUTH_SECRET), message);
        byte[] second = encryption.encrypt(decode(RECEIVER_PUBLIC), decode(AUTH_SECRET), message);

        assertThat(first).isNotEqualTo(second);
        assertThat(WebPushDecryption.decrypt(first, decode(RECEIVER_PRIVATE), decode(RECEIVER_PUBLIC), decode(AUTH_SECRET))).isEqualTo(message);
        assertThat(WebPushDecryption.decrypt(second, decode(RECEIVER_PRIVATE), decode(RECEIVER_PUBLIC), decode(AUTH_SECRET))).isEqualTo(message);
    }

    @Test
    @DisplayName("Given a receiver key that is not a point of P-256, when a message is encrypted for it, then it is refused")
    void should_refuse_when_encrypted_given_a_point_off_the_curve() {
        byte[] offCurve = decode(RECEIVER_PUBLIC);
        offCurve[64] ^= 1;

        assertThatThrownBy(() -> WebPushEncryption.random().encrypt(offCurve, decode(AUTH_SECRET), new byte[]{1}))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a message longer than one record, when it is encrypted, then it is refused")
    void should_refuse_when_encrypted_given_a_message_beyond_one_record() {
        assertThatThrownBy(() -> WebPushEncryption.random().encrypt(decode(RECEIVER_PUBLIC), decode(AUTH_SECRET), new byte[3994]))
                .isInstanceOf(IllegalArgumentException.class);
    }

    static byte[] decode(String base64Url) {
        return Base64.getUrlDecoder().decode(base64Url);
    }

    static String encode(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
