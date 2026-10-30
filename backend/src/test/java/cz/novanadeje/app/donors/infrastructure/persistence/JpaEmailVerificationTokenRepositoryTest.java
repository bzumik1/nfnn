package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
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
@Import(DonorsPersistenceTestConfiguration.class)
class JpaEmailVerificationTokenRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");
    private static final Duration HOUR = Duration.ofHours(24);

    @Autowired
    private EmailVerificationTokenRepository tokens;
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
        EmailVerificationToken token = EmailVerificationToken.issue(secret, jana, NOW, HOUR);
        tokens.save(token);
        flushAndClear();

        EmailVerificationToken found = tokens.findBySecretHash(secret.hash()).orElseThrow();

        assertThat(found.id()).isEqualTo(token.id());
        assertThat(found.donorId()).isEqualTo(jana);
        assertThat(found.issuedAt()).isEqualTo(NOW);
        assertThat(found.expiresAt()).isEqualTo(NOW.plus(HOUR));
        assertThat(found.usedAt()).isEmpty();
        assertThat(found.newEmail()).isEmpty();
        assertThat(tokens.findBySecretHash(LinkSecret.generate().hash())).isEmpty();
    }

    @Test
    @DisplayName("Given a saved change token, when it is found by the hash of its secret, then the new address survives")
    void should_keep_new_email_when_found_by_secret_hash_given_saved_change_token() {
        LinkSecret secret = LinkSecret.generate();
        EmailAddress newEmail = new EmailAddress("jana.nova@example.cz");
        tokens.save(EmailVerificationToken.issueForChange(secret, jana, newEmail, NOW, HOUR));
        flushAndClear();

        EmailVerificationToken found = tokens.findBySecretHash(secret.hash()).orElseThrow();

        assertThat(found.isForChange()).isTrue();
        assertThat(found.newEmail()).contains(newEmail);
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
        EmailVerificationToken used = issue(jana, NOW);
        issue(jana, NOW.minus(HOUR));
        EmailVerificationToken live = issue(jana, NOW.minusSeconds(60));
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
        EmailVerificationToken token = issue(jana, NOW);
        flushAndClear();

        assertThat(tokens.markUsed(token.id(), NOW.plusSeconds(10))).isTrue();
        assertThat(tokens.markUsed(token.id(), NOW.plusSeconds(20))).isFalse();
        flushAndClear();

        assertThat(tokens.findBySecretHash(token.secretHash()).orElseThrow().usedAt()).contains(NOW.plusSeconds(10));
    }

    @Test
    @DisplayName("Given an expired or unknown token, when it is marked used, then nothing is won")
    void should_not_win_when_marked_used_given_expired_or_unknown_token() {
        EmailVerificationToken token = issue(jana, NOW);
        flushAndClear();

        assertThat(tokens.markUsed(token.id(), NOW.plus(HOUR))).isFalse();
        assertThat(tokens.markUsed(UUID.randomUUID(), NOW)).isFalse();
        flushAndClear();

        assertThat(tokens.findBySecretHash(token.secretHash()).orElseThrow().usedAt()).isEmpty();
    }

    @Test
    @DisplayName("Given three tokens of a donor, one used, and one of another donor, when all of the donor's are deleted, then only the other donor's stays")
    void should_keep_only_other_donors_token_when_all_of_donor_deleted_given_three_tokens() {
        EmailVerificationToken used = issue(jana, NOW);
        issue(jana, NOW);
        issue(jana, NOW);
        issue(petr, NOW);
        flushAndClear();
        tokens.markUsed(used.id(), NOW);

        tokens.deleteAllOf(jana);
        flushAndClear();

        assertThat(tokens.countOf(jana)).isZero();
        assertThat(tokens.findBySecretHash(used.secretHash())).isEmpty();
        assertThat(tokens.countOf(petr)).isEqualTo(1);
    }

    @Test
    @DisplayName("Given change links of a donor, one used, one expired and two live, when the pending change is looked up, then the newest live one is found")
    void should_find_newest_live_change_when_pending_change_looked_up_given_mixed_change_links() {
        EmailVerificationToken used = issueForChange(jana, "jana.used@example.cz", NOW);
        issueForChange(jana, "jana.expired@example.cz", NOW.minus(HOUR).minusSeconds(1));
        issueForChange(jana, "jana.older@example.cz", NOW.minusSeconds(120));
        EmailVerificationToken newest = issueForChange(jana, "jana.nova@example.cz", NOW.minusSeconds(60));
        issue(jana, NOW);
        issueForChange(petr, "petr.novy@example.cz", NOW);
        tokens.markUsed(used.id(), NOW);
        flushAndClear();

        EmailVerificationToken pending = tokens.findPendingChangeOf(jana, NOW).orElseThrow();

        assertThat(pending.id()).isEqualTo(newest.id());
        assertThat(pending.newEmail()).contains(new EmailAddress("jana.nova@example.cz"));
        assertThat(pending.expiresAt()).isEqualTo(NOW.minusSeconds(60).plus(HOUR));
    }

    @Test
    @DisplayName("Given only a verification link and a used change link, when the pending change is looked up, then none is found")
    void should_find_nothing_when_pending_change_looked_up_given_no_live_change_link() {
        EmailVerificationToken used = issueForChange(jana, "jana.nova@example.cz", NOW);
        issue(jana, NOW);
        tokens.markUsed(used.id(), NOW);
        flushAndClear();

        assertThat(tokens.findPendingChangeOf(jana, NOW)).isEmpty();
    }

    @Test
    @DisplayName("Given change links and a verification link of a donor and a change link of another, when the donor's change links are deleted, then only the verification link and the other donor's link stay")
    void should_keep_verification_and_other_donor_links_when_change_links_deleted_given_mixed_links() {
        issueForChange(jana, "jana.nova@example.cz", NOW);
        issueForChange(jana, "jana.jina@example.cz", NOW.minusSeconds(60));
        EmailVerificationToken verification = issue(jana, NOW);
        issueForChange(petr, "petr.novy@example.cz", NOW);
        flushAndClear();

        tokens.deleteChangeLinksOf(jana);
        flushAndClear();

        assertThat(tokens.countOf(jana)).isEqualTo(1);
        assertThat(tokens.findBySecretHash(verification.secretHash())).isPresent();
        assertThat(tokens.countOf(petr)).isEqualTo(1);
    }

    private EmailVerificationToken issueForChange(DonorId donorId, String newEmail, Instant issuedAt) {
        EmailVerificationToken token = EmailVerificationToken.issueForChange(LinkSecret.generate(), donorId, new EmailAddress(newEmail), issuedAt, HOUR);
        tokens.save(token);
        return token;
    }

    private EmailVerificationToken issue(DonorId donorId, Instant issuedAt) {
        EmailVerificationToken token = EmailVerificationToken.issue(LinkSecret.generate(), donorId, issuedAt, HOUR);
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
