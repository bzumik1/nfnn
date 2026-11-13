package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;

class Sha256Test {

    private static final byte[] ABC = "abc".getBytes(StandardCharsets.US_ASCII);
    private static final String ABC_HEX = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    @Test
    @DisplayName("Given the bytes of FIPS 180-2's example, when they are digested, then the digest is the published one")
    void should_be_published_digest_when_digested_given_fips_example() {
        assertThat(Sha256.digest(ABC)).isEqualTo(HexFormat.of().parseHex(ABC_HEX));
    }

    @Test
    @DisplayName("Given the bytes of FIPS 180-2's example, when their hex form is taken, then it is the published digest in lowercase hex")
    void should_be_lowercase_hex_when_hex_taken_given_fips_example() {
        assertThat(Sha256.hex(ABC)).isEqualTo(ABC_HEX);
    }

    @Test
    @DisplayName("Given the verifier of RFC 7636, when its base64url form is taken, then it is the challenge of the RFC without padding")
    void should_be_unpadded_base64url_when_base64url_taken_given_rfc7636_verifier() {
        assertThat(Sha256.base64Url("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk".getBytes(StandardCharsets.US_ASCII)))
                .isEqualTo("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }
}
