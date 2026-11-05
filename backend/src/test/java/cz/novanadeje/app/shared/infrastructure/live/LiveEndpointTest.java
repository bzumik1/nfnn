package cz.novanadeje.app.shared.infrastructure.live;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.shared.application.event.DonorSessionsEnded;
import cz.novanadeje.app.shared.application.event.LiveFeed;
import cz.novanadeje.app.shared.application.event.StoredDataChanged;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class LiveEndpointTest {

    private static final Duration HINT_WITHIN = Duration.ofSeconds(1);

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JwtEncoder encoder;
    @Autowired
    private JwtProperties jwt;
    @Autowired
    private Clock clock;
    @Autowired
    private ApplicationEventPublisher events;
    @Autowired
    private TransactionTemplate transactions;
    @Autowired
    private LiveStreamHub hub;

    @Test
    @DisplayName("Given no token, when the live stream is asked for, then the answer is 401 problem+json")
    void should_answer_401_when_stream_requested_given_no_token() throws Exception {
        mockMvc.perform(get("/api/live").accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.type").value("https://nfnn.cz/problems/auth/unauthenticated"));
    }

    @Test
    @DisplayName("Given a connected application's token with admin scope, when the live stream is asked for, then the answer is 403, because the stream is for browser sessions only")
    void should_answer_403_when_stream_requested_given_connector_token() throws Exception {
        String token = token(UUID.randomUUID(), List.of("ADMIN"), "admin:read admin:write", clock.instant());

        mockMvc.perform(get("/api/live").accept(MediaType.TEXT_EVENT_STREAM).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.type").value("https://nfnn.cz/problems/auth/forbidden"));
    }

    @Test
    @DisplayName("Given a donor's browser token, when the live stream opens, then it streams unbuffered and uncached and starts with the revision")
    void should_stream_revision_unbuffered_when_opened_given_donor_token() throws Exception {
        MvcResult stream = open(token(UUID.randomUUID(), List.of(), null, clock.instant()));

        assertThat(stream.getResponse().getContentType()).startsWith(MediaType.TEXT_EVENT_STREAM_VALUE);
        assertThat(stream.getResponse().getHeader("X-Accel-Buffering")).isEqualTo("no");
        assertThat(stream.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).contains("no-store");
        assertThat(stream.getResponse().getHeader("Nfnn-Revision")).isEqualTo("f00ba12");
        assertThat(stream.getResponse().getContentAsString()).startsWith("event:revision\ndata:{\"revision\":\"f00ba12\"}\n\n");
    }

    @Test
    @DisplayName("Given a donor's open stream, when a change of the donor's donations commits, then the hint arrives within a second, and a change rolled back sends none")
    void should_hint_within_a_second_when_change_commits_given_open_stream() throws Exception {
        UUID donor = UUID.randomUUID();
        MvcResult stream = open(token(donor, List.of(), null, clock.instant()));

        transactions.executeWithoutResult(status -> {
            events.publishEvent(StoredDataChanged.ofDonor(LiveFeed.BANK_ACCOUNTS, donor));
            status.setRollbackOnly();
        });
        transactions.executeWithoutResult(status -> events.publishEvent(StoredDataChanged.ofDonor(LiveFeed.DONATIONS, donor)));

        await().atMost(HINT_WITHIN).untilAsserted(() ->
                assertThat(stream.getResponse().getContentAsString()).contains("event:changed\ndata:{\"feed\":\"donations\"}\n\n"));
        assertThat(stream.getResponse().getContentAsString()).doesNotContain("bank-accounts");
    }

    @Test
    @DisplayName("Given a donor's and an administrator's open streams, when payments change, then only the administrator's stream hears it")
    void should_hint_payments_only_to_administrator_when_payments_change_given_donor_and_administrator() throws Exception {
        MvcResult donor = open(token(UUID.randomUUID(), List.of(), null, clock.instant()));
        MvcResult admin = open(token(UUID.randomUUID(), List.of("ADMIN"), null, clock.instant()));

        transactions.executeWithoutResult(status -> events.publishEvent(StoredDataChanged.of(LiveFeed.PAYMENTS)));
        transactions.executeWithoutResult(status -> events.publishEvent(StoredDataChanged.of(LiveFeed.BANK_IMPORT)));

        await().atMost(HINT_WITHIN).untilAsserted(() -> assertThat(admin.getResponse().getContentAsString())
                .contains("data:{\"feed\":\"payments\"}").contains("data:{\"feed\":\"bank-import\"}"));
        await().atMost(HINT_WITHIN).untilAsserted(() -> assertThat(donor.getResponse().getContentAsString()).contains("data:{\"feed\":\"bank-import\"}"));
        assertThat(donor.getResponse().getContentAsString()).doesNotContain("payments");
    }

    @Test
    @DisplayName("Given a donor's open stream, when every session of the donor ends, then the stream closes and the same token is refused as expired")
    void should_close_stream_and_refuse_token_when_sessions_end_given_open_stream() throws Exception {
        UUID donor = UUID.randomUUID();
        Instant issuedAt = clock.instant().minusSeconds(5);
        String token = token(donor, List.of(), null, issuedAt);
        MvcResult stream = open(token);
        int openBefore = hub.openStreams();

        transactions.executeWithoutResult(status -> events.publishEvent(new DonorSessionsEnded(donor, clock.instant())));

        assertThat(stream.getAsyncResult(HINT_WITHIN.toMillis())).isNull();
        assertThat(hub.openStreams()).isEqualTo(openBefore - 1);
        mockMvc.perform(get("/api/live").accept(MediaType.TEXT_EVENT_STREAM).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.type").value("https://nfnn.cz/problems/auth/expired-token"));
    }

    @Test
    @DisplayName("Given a token that expires in a moment, when its stream is open, then the stream closes at the token's expiry")
    void should_close_stream_when_token_expires_given_short_lived_token() throws Exception {
        Instant now = clock.instant();
        MvcResult stream = open(token(UUID.randomUUID(), List.of(), null, now, now.plusMillis(1500)));

        assertThat(stream.getAsyncResult(Duration.ofSeconds(5).toMillis())).isNull();
    }

    private MvcResult open(String token) throws Exception {
        return mockMvc.perform(get("/api/live").accept(MediaType.TEXT_EVENT_STREAM).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(request().asyncStarted())
                .andExpect(header().string("X-Accel-Buffering", "no"))
                .andReturn();
    }

    private String token(UUID donor, List<String> roles, String scope, Instant issuedAt) {
        return token(donor, roles, scope, issuedAt, issuedAt.plus(jwt.accessTokenTtl()));
    }

    private String token(UUID donor, List<String> roles, String scope, Instant issuedAt, Instant expiresAt) {
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(jwt.issuer())
                .subject(donor.toString())
                .audience(List.of(jwt.audience()))
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim(JwtProperties.ROLES_CLAIM, roles);
        if (scope != null) {
            claims.claim(JwtProperties.SCOPE_CLAIM, scope);
        }
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims.build())).getTokenValue();
    }
}
