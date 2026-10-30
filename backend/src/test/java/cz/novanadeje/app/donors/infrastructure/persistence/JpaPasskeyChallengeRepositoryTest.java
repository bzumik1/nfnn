package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasskeyChallenge;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(DonorsPersistenceTestConfiguration.class)
class JpaPasskeyChallengeRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final Duration LIFETIME = Duration.ofMinutes(5);

    @Autowired
    private PasskeyChallengeRepository challenges;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given a sign-in challenge, when it is marked used twice, then only the first use counts and its time stays")
    void should_count_only_first_use_when_marked_used_twice_given_sign_in_challenge() {
        LinkSecret secret = LinkSecret.generate();
        PasskeyChallenge challenge = PasskeyChallenge.forSignIn(secret, NOW, Duration.ofMinutes(5));
        challenges.save(challenge);
        entityManager.flush();
        entityManager.clear();

        assertThat(challenges.markUsed(challenge.id(), NOW.plusSeconds(10))).isTrue();
        assertThat(challenges.markUsed(challenge.id(), NOW.plusSeconds(11))).isFalse();

        assertThat(challenges.findByChallengeHash(secret.hash()).orElseThrow().usedAt()).contains(NOW.plusSeconds(10));
    }

    @Test
    @DisplayName("Given challenges that expired before, expire exactly at and expire after now, when the expired ones are deleted, then the one still open stays")
    void should_keep_only_open_challenge_when_expired_are_deleted_given_challenges_around_now() {
        LinkSecret expiredEarlier = LinkSecret.generate();
        LinkSecret expiringNow = LinkSecret.generate();
        LinkSecret stillOpen = LinkSecret.generate();
        challenges.save(PasskeyChallenge.forSignIn(expiredEarlier, NOW.minus(LIFETIME).minusSeconds(1), LIFETIME));
        challenges.save(PasskeyChallenge.forSignIn(expiringNow, NOW.minus(LIFETIME), LIFETIME));
        challenges.save(PasskeyChallenge.forSignIn(stillOpen, NOW.minus(LIFETIME).plusSeconds(1), LIFETIME));
        flushAndClear();

        challenges.deleteExpiredAt(NOW);
        flushAndClear();

        assertThat(challenges.findByChallengeHash(expiredEarlier.hash())).isEmpty();
        assertThat(challenges.findByChallengeHash(expiringNow.hash())).isEmpty();
        assertThat(challenges.findByChallengeHash(stillOpen.hash())).isPresent();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
