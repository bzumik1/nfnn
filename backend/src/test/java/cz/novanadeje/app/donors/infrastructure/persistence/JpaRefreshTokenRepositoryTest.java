package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
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
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaDonorRepository.class, JpaRefreshTokenRepository.class})
class JpaRefreshTokenRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final Duration TTL = Duration.ofDays(14);
    private static final ClientId CLAUDE = new ClientId("https://claude.ai/.well-known/oauth-client");

    @Autowired
    private RefreshTokenRepository refreshTokens;
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
    @DisplayName("Given a used and a revoked token, when they are found by hash, then the use and the revocation survive separately")
    void should_keep_use_and_revocation_apart_when_found_given_both_kinds() {
        RefreshTokenSecret usedSecret = RefreshTokenSecret.generate();
        RefreshToken used = RefreshToken.issue(usedSecret, jana, NOW, TTL, false);
        used.markUsed(NOW.plusSeconds(60));
        RefreshTokenSecret revokedSecret = RefreshTokenSecret.generate();
        RefreshToken revoked = RefreshToken.issue(revokedSecret, jana, NOW, TTL, false);
        revoked.revoke(NOW.plusSeconds(120));
        refreshTokens.save(used);
        refreshTokens.save(revoked);
        flushAndClear();

        RefreshToken foundUsed = refreshTokens.findBySecretHash(usedSecret.hash()).orElseThrow();
        RefreshToken foundRevoked = refreshTokens.findBySecretHash(revokedSecret.hash()).orElseThrow();

        assertThat(foundUsed.usedAt()).contains(NOW.plusSeconds(60));
        assertThat(foundUsed.isRevoked()).isFalse();
        assertThat(foundRevoked.revokedAt()).contains(NOW.plusSeconds(120));
        assertThat(foundRevoked.isUsed()).isFalse();
    }

    @Test
    @DisplayName("Given a client's rotated, revoked, expired and live tokens, when the usable client tokens are listed, then only the live one is returned")
    void should_list_only_live_client_tokens_when_listed_given_rotated_revoked_and_expired_ones() {
        RefreshToken rotated = RefreshToken.issueForClient(RefreshTokenSecret.generate(), jana, CLAUDE, Set.of(OAuthScope.ADMIN_READ), NOW, NOW, TTL);
        rotated.markUsed(NOW.plusSeconds(60));
        RefreshToken revoked = RefreshToken.issueForClient(RefreshTokenSecret.generate(), jana, CLAUDE, Set.of(OAuthScope.ADMIN_READ), NOW, NOW, TTL);
        revoked.revoke(NOW.plusSeconds(60));
        RefreshToken expired = RefreshToken.issueForClient(RefreshTokenSecret.generate(), jana, CLAUDE, Set.of(OAuthScope.ADMIN_READ), NOW,
                NOW.minus(TTL), TTL);
        RefreshToken browser = RefreshToken.issue(RefreshTokenSecret.generate(), jana, NOW, TTL, true);
        RefreshToken live = RefreshToken.issueForClient(RefreshTokenSecret.generate(), jana, CLAUDE, Set.of(OAuthScope.ADMIN_READ), NOW,
                NOW.plusSeconds(60), TTL);
        for (RefreshToken token : new RefreshToken[]{rotated, revoked, expired, browser, live}) {
            refreshTokens.save(token);
        }
        flushAndClear();

        assertThat(refreshTokens.findUsableClientTokensOf(jana, NOW.plusSeconds(120))).extracting(RefreshToken::id).containsExactly(live.id());
    }

    @Test
    @DisplayName("Given a used and a live token, when every token of the donor is revoked, then both carry the revocation and the use stays")
    void should_revoke_every_token_when_all_revoked_given_used_and_live_tokens() {
        RefreshTokenSecret usedSecret = RefreshTokenSecret.generate();
        RefreshToken used = RefreshToken.issue(usedSecret, jana, NOW, TTL, false);
        used.markUsed(NOW.plusSeconds(60));
        RefreshTokenSecret liveSecret = RefreshTokenSecret.generate();
        refreshTokens.save(used);
        refreshTokens.save(RefreshToken.issue(liveSecret, jana, NOW.plusSeconds(60), TTL, false));
        flushAndClear();

        refreshTokens.revokeAllOf(jana, NOW.plusSeconds(120));
        flushAndClear();

        RefreshToken foundUsed = refreshTokens.findBySecretHash(usedSecret.hash()).orElseThrow();
        assertThat(foundUsed.revokedAt()).contains(NOW.plusSeconds(120));
        assertThat(foundUsed.usedAt()).contains(NOW.plusSeconds(60));
        assertThat(refreshTokens.findBySecretHash(liveSecret.hash()).orElseThrow().revokedAt()).contains(NOW.plusSeconds(120));
    }

    @Test
    @DisplayName("Given a live token, when it is marked used twice, then only the first use counts and its time stays")
    void should_count_only_first_use_when_marked_used_twice_given_live_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken token = RefreshToken.issue(secret, jana, NOW, TTL, false);
        refreshTokens.save(token);
        flushAndClear();

        assertThat(refreshTokens.markUsed(token.id(), NOW.plusSeconds(60))).isTrue();
        assertThat(refreshTokens.markUsed(token.id(), NOW.plusSeconds(61))).isFalse();

        assertThat(refreshTokens.findBySecretHash(secret.hash()).orElseThrow().usedAt()).contains(NOW.plusSeconds(60));
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
