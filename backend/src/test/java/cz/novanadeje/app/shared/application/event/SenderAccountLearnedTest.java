package cz.novanadeje.app.shared.application.event;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SenderAccountLearnedTest {

    private static final UUID DONOR_ID = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final Instant AT = Instant.parse("2026-10-17T10:00:00Z");

    @Test
    @DisplayName("Given the last four digits of an account, when a learned account is announced, then it carries them")
    void should_carry_the_last_digits_when_announced_given_four_digits() {
        assertThat(new SenderAccountLearned(DONOR_ID, "5399", AT).accountLastDigits()).isEqualTo("5399");
        assertThat(new SenderAccountLearned(DONOR_ID, "29", AT).accountLastDigits()).isEqualTo("29");
    }

    @Test
    @DisplayName("Given a whole account number, a bank code or nothing, when a learned account is announced, then it is refused")
    void should_refuse_when_announced_given_more_than_the_last_digits() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccountLearned(DONOR_ID, "2000145399", AT));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccountLearned(DONOR_ID, "5399/0800", AT));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccountLearned(DONOR_ID, null, AT));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccountLearned(null, "5399", AT));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccountLearned(DONOR_ID, "5399", null));
    }
}
