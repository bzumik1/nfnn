package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.AuthorizationCode;
import cz.novanadeje.app.donors.domain.AuthorizationCodeRepository;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.CodeChallenge;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.PasswordHash;
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

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(DonorsPersistenceTestConfiguration.class)
class JpaAuthorizationCodeRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final String CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    @Autowired
    private AuthorizationCodeRepository codes;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private EntityManager entityManager;

    private DonorId jana;

    @BeforeEach
    void setUp() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress("jana@example.cz"), new PasswordHash("$hash"),
                new VariableSymbol("4821937560"), LocaleCode.CS, NOW);
        donors.save(donor);
        jana = donor.id();
        flushAndClear();
    }

    @Test
    @DisplayName("Given an issued code, when it is marked used twice, then only the first use counts and its time stays")
    void should_count_only_first_use_when_marked_used_twice_given_issued_code() {
        LinkSecret secret = LinkSecret.generate();
        AuthorizationCode code = AuthorizationCode.issue(secret, jana, new ClientId("https://claude.ai/oauth/mcp-oauth-client-metadata"),
                URI.create("https://claude.ai/api/mcp/auth_callback"), new CodeChallenge(CHALLENGE, "S256"), Set.of(OAuthScope.ADMIN_READ),
                "https://nfnn.cz/mcp", true, NOW, Duration.ofMinutes(5));
        codes.save(code);
        flushAndClear();

        assertThat(codes.markUsed(code.id(), NOW.plusSeconds(10))).isTrue();
        assertThat(codes.markUsed(code.id(), NOW.plusSeconds(11))).isFalse();

        assertThat(codes.findBySecretHash(secret.hash()).orElseThrow().usedAt()).contains(NOW.plusSeconds(10));
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
