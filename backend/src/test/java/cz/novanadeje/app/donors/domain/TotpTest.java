package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class TotpTest {

    private static final TotpSecret RFC_SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    @ParameterizedTest(name = "at {0} s the code is {1}")
    @CsvSource({
            "59, 287082",
            "1111111109, 081804",
            "1111111111, 050471",
            "1234567890, 005924",
            "2000000000, 279037",
            "20000000000, 353130"
    })
    @DisplayName("Given the RFC 6238 secret, when a code is computed at a test vector time, then it is the last six digits of the RFC's SHA-1 code")
    void should_match_rfc_6238_vectors(long epochSecond, String expected) {
        assertThat(Totp.codeAt(RFC_SECRET, Totp.stepAt(Instant.ofEpochSecond(epochSecond)))).isEqualTo(expected);
    }

    @Test
    @DisplayName("Given a code from the step before or after, when it is checked, then it matches with its own step")
    void should_accept_neighbouring_steps_when_checked_given_clock_drift() {
        Instant now = Instant.ofEpochSecond(1111111111);
        long step = Totp.stepAt(now);

        assertThat(Totp.matchingStep(RFC_SECRET, Totp.codeAt(RFC_SECRET, step), now)).hasValue(step);
        assertThat(Totp.matchingStep(RFC_SECRET, Totp.codeAt(RFC_SECRET, step - 1), now)).hasValue(step - 1);
        assertThat(Totp.matchingStep(RFC_SECRET, Totp.codeAt(RFC_SECRET, step + 1), now)).hasValue(step + 1);
    }

    @Test
    @DisplayName("Given a code two steps old, a malformed code or a wrong one, when it is checked, then nothing matches")
    void should_reject_old_malformed_and_wrong_codes() {
        Instant now = Instant.ofEpochSecond(1111111111);
        long step = Totp.stepAt(now);

        assertThat(Totp.matchingStep(RFC_SECRET, Totp.codeAt(RFC_SECRET, step - 2), now)).isEmpty();
        assertThat(Totp.matchingStep(RFC_SECRET, "05047", now)).isEmpty();
        assertThat(Totp.matchingStep(RFC_SECRET, "0504711", now)).isEmpty();
        assertThat(Totp.matchingStep(RFC_SECRET, "05O471", now)).isEmpty();
        assertThat(Totp.matchingStep(RFC_SECRET, null, now)).isEmpty();
        assertThat(Totp.matchingStep(RFC_SECRET, "000000", now)).isEmpty();
    }
}
