package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SecondFactorRecoveryTest {

    private static final Instant NOW = Instant.parse("2026-10-24T10:00:00Z");
    private static final Duration TTL = Duration.ofDays(14);
    private static final SecondFactorRecoveryCode CODE = new SecondFactorRecoveryCode("ABCD2345");
    private static final SecondFactorRecoveryCode NULL_CODE = null;

    @Test
    @DisplayName("Given a recovery just opened, when it is checked within its lifetime, then it is open for its donor and found by the code's hash")
    void should_be_open_and_found_by_the_hash_when_opened() {
        DonorId donor = DonorId.newId(NOW);

        SecondFactorRecovery recovery = SecondFactorRecovery.open(donor, CODE, NOW, TTL);

        assertThat(recovery.isOpenAt(NOW.plus(TTL).minusSeconds(1))).isTrue();
        assertThat(recovery.donorId()).isEqualTo(donor);
        assertThat(recovery.codeHash()).isEqualTo(CODE.hash()).doesNotContain(CODE.value());
        assertThat(recovery.createdAt()).isEqualTo(NOW);
        assertThat(recovery.expiresAt()).isEqualTo(NOW.plus(TTL));
        assertThat(recovery.usedAt()).isEmpty();
    }

    @Test
    @DisplayName("Given a recovery just opened, when the donor starts it again, then it still holds its code to show the same payment")
    void should_keep_its_code_when_opened() {
        SecondFactorRecovery recovery = SecondFactorRecovery.open(DonorId.newId(NOW), CODE, NOW, TTL);

        assertThat(recovery.code()).contains(CODE);
        assertThat(recovery.toString()).doesNotContain(CODE.value());
    }

    @Test
    @DisplayName("Given a recovery stored before codes were kept, when it is reconstituted, then it holds no code and cannot be shown again")
    void should_hold_no_code_when_reconstituted_given_a_recovery_stored_without_one() {
        SecondFactorRecovery recovery = SecondFactorRecovery.reconstitute(UUID.fromString("0192b3c4-0000-7000-8000-000000000001"), DonorId.newId(NOW), CODE.hash(), NULL_CODE,
                NOW, NOW.plus(TTL), null);

        assertThat(recovery.code()).isEmpty();
    }

    @Test
    @DisplayName("Given a recovery, when its lifetime passed or it was used, then it is not open any more")
    void should_be_closed_when_expired_or_used() {
        SecondFactorRecovery expired = SecondFactorRecovery.open(DonorId.newId(NOW), CODE, NOW, TTL);
        SecondFactorRecovery used = SecondFactorRecovery.open(DonorId.newId(NOW), CODE, NOW, TTL);

        used.markUsed(NOW.plusSeconds(60));

        assertThat(expired.isOpenAt(NOW.plus(TTL))).isFalse();
        assertThat(used.isOpenAt(NOW.plusSeconds(61))).isFalse();
        assertThat(used.usedAt()).contains(NOW.plusSeconds(60));
    }
}
