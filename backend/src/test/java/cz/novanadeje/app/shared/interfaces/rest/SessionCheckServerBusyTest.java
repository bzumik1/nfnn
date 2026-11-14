package cz.novanadeje.app.shared.interfaces.rest;

import com.zaxxer.hikari.HikariDataSource;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class SessionCheckServerBusyTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JwtEncoder encoder;
    @Autowired
    private JwtProperties jwt;
    @Autowired
    private Clock clock;
    @Autowired
    private DataSource dataSource;

    @Test
    @DisplayName("Given a signed-in request whose session check is interrupted waiting for a connection of an exhausted pool, as at shutdown, when it comes, then the answer is 503 server-busy to retry in five seconds")
    void should_answer_503_server_busy_when_requested_given_session_check_interrupted_waiting_for_connection() throws Exception {
        String token = browserToken(UUID.randomUUID());

        ResultActions answer = whileWaitingForAnExhaustedPoolIsInterrupted(() -> mockMvc.perform(get("/api/content/home")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header(HttpHeaders.ACCEPT_LANGUAGE, "cs")));

        answer.andExpect(status().isServiceUnavailable())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "5"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.type").value("https://nfnn.cz/problems/server-busy"))
                .andExpect(jsonPath("$.title").value("Server je právě vytížený"));
    }

    private ResultActions whileWaitingForAnExhaustedPoolIsInterrupted(Request request) throws Exception {
        HikariDataSource pool = dataSource.unwrap(HikariDataSource.class);
        List<Connection> held = new ArrayList<>();
        try {
            for (int taken = 0; taken < pool.getMaximumPoolSize(); taken++) {
                held.add(pool.getConnection());
            }
            Thread.currentThread().interrupt();
            return request.perform();
        } finally {
            Thread.interrupted();
            for (Connection connection : held) {
                close(connection);
            }
        }
    }

    private static void close(Connection connection) {
        try {
            connection.close();
        } catch (SQLException ignored) {
            return;
        }
    }

    private String browserToken(UUID donor) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(jwt.issuer())
                .subject(donor.toString())
                .audience(List.of(jwt.audience()))
                .issuedAt(clock.instant())
                .expiresAt(clock.instant().plus(Duration.ofMinutes(5)))
                .claim(JwtProperties.ROLES_CLAIM, List.of())
                .claim(JwtProperties.SESSION_CLAIM, UUID.randomUUID().toString())
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    @FunctionalInterface
    private interface Request {
        ResultActions perform() throws Exception;
    }
}
