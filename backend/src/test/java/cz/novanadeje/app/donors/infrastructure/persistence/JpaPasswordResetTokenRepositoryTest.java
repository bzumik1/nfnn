package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaDonorRepository.class, JpaPasswordResetTokenRepository.class})
class JpaPasswordResetTokenRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");
    private static final Duration HOUR = Duration.ofHours(1);

    @Autowired
    private PasswordResetTokenRepository tokens;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private EntityManager entityManager;

    private DonorId jana;
    private DonorId petr;

    @BeforeEach
    void setUp() {
        jana = donor("jana@example.cz", "4821937560");
        petr = donor("petr@example.cz", "4821937561");
        flushAndClear();
    }

    @Test
    @DisplayName("Given a saved token, when it is found by the hash of its secret, then every field survives")
    void should_keep_fields_when_found_by_secret_hash_given_saved_token() {
        LinkSecret secret = LinkSecret.generate();
        PasswordResetToken token = PasswordResetToken.issue(secret, jana, NOW, HOUR);
        tokens.save(token);
        flushAndClear();

        PasswordResetToken found = tokens.findBySecretHash(secret.hash()).orElseThrow();

        assertThat(found.id()).isEqualTo(token.id());
        assertThat(found.donorId()).isEqualTo(jana);
        assertThat(found.issuedAt()).isEqualTo(NOW);
        assertThat(found.expiresAt()).isEqualTo(NOW.plus(HOUR));
        assertThat(found.usedAt()).isEmpty();
        assertThat(tokens.findBySecretHash(LinkSecret.generate().hash())).isEmpty();
    }

    @Test
    @DisplayName("Given tokens of two donors, when one donor's tokens are counted, then only theirs count")
    void should_count_only_donor_tokens_when_counted_given_two_donors() {
        issue(jana, NOW);
        issue(jana, NOW);
        issue(petr, NOW);
        flushAndClear();

        assertThat(tokens.countOf(jana)).isEqualTo(2);
        assertThat(tokens.countOf(petr)).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a used, an expired and a live token, when the unusable ones are deleted, then only the live one and the other donor's stay")
    void should_delete_used_and_expired_when_unusable_deleted_given_mixed_tokens() {
        PasswordResetToken used = issue(jana, NOW);
        issue(jana, NOW.minus(HOUR));
        PasswordResetToken live = issue(jana, NOW.minusSeconds(60));
        issue(petr, NOW.minus(HOUR));
        tokens.markUsed(used.id(), NOW);
        flushAndClear();

        tokens.deleteUnusableOf(jana, NOW);
        flushAndClear();

        assertThat(tokens.countOf(jana)).isEqualTo(1);
        assertThat(tokens.findBySecretHash(live.secretHash())).isPresent();
        assertThat(tokens.countOf(petr)).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a live token, when it is marked used twice, then the first wins and the second finds nothing to win")
    void should_win_once_when_marked_used_twice_given_live_token() {
        PasswordResetToken token = issue(jana, NOW);
        flushAndClear();

        assertThat(tokens.markUsed(token.id(), NOW.plusSeconds(10))).isTrue();
        assertThat(tokens.markUsed(token.id(), NOW.plusSeconds(20))).isFalse();
        flushAndClear();

        assertThat(tokens.findBySecretHash(token.secretHash()).orElseThrow().usedAt()).contains(NOW.plusSeconds(10));
    }

    @Test
    @DisplayName("Given an expired or unknown token, when it is marked used, then nothing is won")
    void should_not_win_when_marked_used_given_expired_or_unknown_token() {
        PasswordResetToken token = issue(jana, NOW);
        flushAndClear();

        assertThat(tokens.markUsed(token.id(), NOW.plus(HOUR))).isFalse();
        assertThat(tokens.markUsed(UUID.randomUUID(), NOW)).isFalse();
        flushAndClear();

        assertThat(tokens.findBySecretHash(token.secretHash()).orElseThrow().usedAt()).isEmpty();
    }

    @Test
    @DisplayName("Given three tokens of a donor and one of another, when the others of one token are deleted, then only it and the other donor's stay")
    void should_keep_only_kept_token_when_others_deleted_given_three_tokens() {
        PasswordResetToken kept = issue(jana, NOW);
        issue(jana, NOW);
        issue(jana, NOW);
        issue(petr, NOW);
        flushAndClear();

        tokens.deleteOthersOf(jana, kept.id());
        flushAndClear();

        assertThat(tokens.countOf(jana)).isEqualTo(1);
        assertThat(tokens.findBySecretHash(kept.secretHash())).isPresent();
        assertThat(tokens.countOf(petr)).isEqualTo(1);
    }

    private PasswordResetToken issue(DonorId donorId, Instant issuedAt) {
        PasswordResetToken token = PasswordResetToken.issue(LinkSecret.generate(), donorId, issuedAt, HOUR);
        tokens.save(token);
        return token;
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
