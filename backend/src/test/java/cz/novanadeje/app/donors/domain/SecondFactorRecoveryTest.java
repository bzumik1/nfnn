package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class SecondFactorRecoveryTest {

    private static final Instant NOW = Instant.parse("2026-10-24T10:00:00Z");
    private static final Duration TTL = Duration.ofDays(14);
    private static final SecondFactorRecoveryCode CODE = new SecondFactorRecoveryCode("ABCD2345");

    @Test
    @DisplayName("Given a recovery just opened, when it is checked within its lifetime, then it is open for its donor and stores only the code's hash")
    void should_be_open_and_keep_only_the_hash_when_opened() {
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
