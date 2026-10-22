package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactorChallenge;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
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
@Import({TestcontainersConfiguration.class, JpaDonorRepository.class, JpaSecondFactorChallengeRepository.class})
class JpaSecondFactorChallengeRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");
    private static final Duration TTL = Duration.ofMinutes(5);

    @Autowired
    private SecondFactorChallengeRepository challenges;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private EntityManager entityManager;

    private DonorId jana;

    @BeforeEach
    void setUp() {
        jana = donor("jana@example.cz", "4821937560");
        flushAndClear();
    }

    @Test
    @DisplayName("Given a saved challenge, when it is found by the hash of its secret, then every field survives")
    void should_keep_fields_when_found_by_secret_hash_given_saved_challenge() {
        LinkSecret secret = LinkSecret.generate();
        SecondFactorChallenge challenge = SecondFactorChallenge.issue(secret, jana, NOW, TTL);
        challenges.save(challenge);
        flushAndClear();

        SecondFactorChallenge found = challenges.findBySecretHash(secret.hash()).orElseThrow();

        assertThat(found.id()).isEqualTo(challenge.id());
        assertThat(found.donorId()).isEqualTo(jana);
        assertThat(found.issuedAt()).isEqualTo(NOW);
        assertThat(found.expiresAt()).isEqualTo(NOW.plus(TTL));
        assertThat(found.failedAttempts()).isZero();
        assertThat(found.usedAt()).isEmpty();
        assertThat(challenges.findBySecretHash(LinkSecret.generate().hash())).isEmpty();
    }

    @Test
    @DisplayName("Given a challenge with a counted attempt and a use, when it is saved again, then both survive")
    void should_keep_attempts_and_use_when_saved_again_given_changed_challenge() {
        LinkSecret secret = LinkSecret.generate();
        challenges.save(SecondFactorChallenge.issue(secret, jana, NOW, TTL));
        flushAndClear();
        SecondFactorChallenge challenge = challenges.findBySecretHash(secret.hash()).orElseThrow();
        challenge.recordFailedAttempt();
        challenge.recordFailedAttempt();
        challenge.markUsed(NOW.plusSeconds(90));

        challenges.save(challenge);
        flushAndClear();

        SecondFactorChallenge found = challenges.findBySecretHash(secret.hash()).orElseThrow();
        assertThat(found.failedAttempts()).isEqualTo(2);
        assertThat(found.usedAt()).contains(NOW.plusSeconds(90));
    }

    private DonorId donor(String email, String variableSymbol) {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol(variableSymbol), LocaleCode.CS, NOW);
        donors.save(donor);
        return donor.id();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
