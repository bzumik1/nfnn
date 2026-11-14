package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RawPassword;
import org.junit.jupiter.api.DisplayName;
import cz.novanadeje.app.shared.infrastructure.busy.CpuSlots;
import cz.novanadeje.app.shared.infrastructure.busy.CpuSlotsFull;
import cz.novanadeje.app.shared.infrastructure.busy.CpuWork;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BCryptPasswordHasherTest {

    private static final String BCRYPT_COST_12 = "\\$2[aby]\\$12\\$[./0-9A-Za-z]{53}";

    private final BCryptPasswordHasher hasher = new BCryptPasswordHasher();

    @Test
    @DisplayName("Given the password a hash was made from, when it is checked, then it matches")
    void should_match_when_checked_given_the_password_it_was_made_from() {
        RawPassword password = new RawPassword("correct horse battery");

        PasswordHash hash = hasher.hash(password);

        assertThat(hash.value()).matches(BCRYPT_COST_12);
        assertThat(hasher.matches(password, hash)).isTrue();
        assertThat(hasher.matches(new RawPassword("wrong horse battery"), hash)).isFalse();
    }

    @Test
    @DisplayName("Given a 128-character password of Czech letters, when hashed, then the whole password is accepted, though it is over 72 bytes")
    void should_hash_when_given_longest_password_of_multibyte_letters() {
        RawPassword password = new RawPassword("ž".repeat(RawPassword.MAX_LENGTH));

        PasswordHash hash = hasher.hash(password);

        assertThat(hasher.matches(password, hash)).isTrue();
    }

    @Test
    @DisplayName("Given two passwords that agree on their first 72 bytes, when one is checked against the other's hash, then it does not match")
    void should_not_match_when_checked_given_a_password_differing_only_after_72_bytes() {
        String firstSeventyTwoBytes = "x".repeat(72);
        PasswordHash hash = hasher.hash(new RawPassword(firstSeventyTwoBytes + "ends one way"));

        assertThat(hasher.matches(new RawPassword(firstSeventyTwoBytes + "ends another"), hash)).isFalse();
        assertThat(hasher.matches(new RawPassword(firstSeventyTwoBytes + "ends one way"), hash)).isTrue();
    }

    @Test
    @DisplayName("Given the default hasher, when its slots are read, then there is one per processor the JVM sees, waited for at most two seconds")
    void should_bound_by_processors_and_two_seconds_when_made_by_default() {
        assertThat(BCryptPasswordHasher.SLOT_WAIT).isEqualTo(Duration.ofSeconds(2));
        assertThat(hasher.slotCount()).isEqualTo(Runtime.getRuntime().availableProcessors());
    }

    @Test
    @DisplayName("Given every hashing slot taken, when a password is hashed or checked, then both are refused as CPU slots full")
    void should_refuse_hash_and_check_when_every_slot_taken() throws Exception {
        CpuSlots slots = new CpuSlots(CpuWork.PASSWORD_HASHING, 1, Duration.ofMillis(50));
        BCryptPasswordHasher bounded = new BCryptPasswordHasher(slots);
        PasswordHash hash = hasher.hash(new RawPassword("correct horse battery"));
        CountDownLatch holding = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            executor.submit(() -> slots.run(() -> {
                holding.countDown();
                try {
                    return release.await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }));
            assertThat(holding.await(5, TimeUnit.SECONDS)).isTrue();

            assertThatThrownBy(() -> bounded.hash(new RawPassword("correct horse battery"))).isInstanceOf(CpuSlotsFull.class);
            assertThatThrownBy(() -> bounded.matches(new RawPassword("correct horse battery"), hash)).isInstanceOf(CpuSlotsFull.class);
            release.countDown();
        }
        assertThat(bounded.matches(new RawPassword("correct horse battery"), hash)).isTrue();
    }
}
