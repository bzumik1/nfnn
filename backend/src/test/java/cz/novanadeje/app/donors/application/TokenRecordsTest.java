package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.application.qr.QrMatrix;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class TokenRecordsTest {

    private static final Instant NOW = Instant.parse("2026-10-23T22:00:00Z");

    @Test
    @DisplayName("Given issued, exchanged and OAuth tokens, when they are printed, then no token appears, only that it is there")
    void should_mask_tokens_when_printed_given_token_records() {
        assertThat(new IssuedTokens("access-secret", NOW, "refresh-secret", NOW, Set.of(Role.ADMIN)).toString())
                .doesNotContain("access-secret", "refresh-secret").contains("ADMIN");
        assertThat(new OAuthTokens("access-secret", NOW, "refresh-secret", Set.of(OAuthScope.ADMIN_READ)).toString())
                .doesNotContain("access-secret", "refresh-secret");
        assertThat(new IssuedAccessToken("access-secret", NOW).toString()).doesNotContain("access-secret");
        assertThat(new ExchangedAccessToken("access-secret", NOW, Set.of(OAuthScope.ADMIN_READ)).toString()).doesNotContain("access-secret");
        assertThat(new CodeExchange("code-secret", "https://claude.ai/c", "https://claude.ai/cb", "verifier-secret", "https://nfnn.cz/mcp").toString())
                .doesNotContain("code-secret", "verifier-secret");
        assertThat(new SecondFactorEnrolment("TOTPSECRET", "otpauth://totp/x?secret=TOTPSECRET", new QrMatrix(21, "0".repeat(441))).toString())
                .doesNotContain("TOTPSECRET");
    }
}
