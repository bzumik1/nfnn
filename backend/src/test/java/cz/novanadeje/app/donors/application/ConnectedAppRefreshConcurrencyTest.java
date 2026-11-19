package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.Donors;
import cz.novanadeje.app.donors.domain.InvalidGrant;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class ConnectedAppRefreshConcurrencyTest {

    private static final ClientId CLAUDE = new ClientId("https://claude.ai/.well-known/oauth-client");

    @Autowired
    private AuthorizationServerService authorizationServer;
    @Autowired
    private DonorSessionService sessions;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private RefreshTokenRepository refreshTokens;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    private final CountDownLatch held = new CountDownLatch(1);
    private final CountDownLatch release = new CountDownLatch(1);
    private final ExecutorService callers = Executors.newFixedThreadPool(3);

    private Donor jana;
    private RefreshTokenSecret connectionSecret;
    private String lostSuccessor;
    private String browserCookie;

    @BeforeEach
    void anAdministratorWhoseConnectedApplicationLostTheAnswerToARefresh() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        jana = Donors.withPassword(Donor.register(DonorId.newId(clock.instant()), DonorType.PERSON, new DonorName("Jana Nováková"),
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress("jana@example.cz"),
                new VariableSymbol("4821937560"), LocaleCode.CS, clock.instant()), new PasswordHash("$hash"));
        jana.verifyEmail(clock.instant());
        jana.grantAdministration(true);
        connectionSecret = RefreshTokenSecret.generate();
        RefreshToken connection = RefreshToken.issueForClient(connectionSecret, jana.id(), CLAUDE, Set.of(OAuthScope.ADMIN_READ), clock.instant(),
                clock.instant(), Duration.ofDays(14));
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.executeWithoutResult(status -> {
            donors.save(jana);
            refreshTokens.save(connection);
        });
        browserCookie = transaction.execute(status -> sessions.signIn(jana, true, DeviceDescription.UNKNOWN, SessionKind.REMEMBERED).refreshToken());
        lostSuccessor = authorizationServer.refresh(connectionSecret.value(), CLAUDE.value()).refreshToken();
    }

    @AfterEach
    void releaseTheCallers() {
        release.countDown();
        callers.shutdownNow();
    }

    @Test
    @DisplayName("Given a connected application that lost the answer to a refresh, when it presents the used token twice at the same moment within the grace, then both presentations get tokens, only the newest refresh token stays usable, and the other one presented later ends every session of the donor")
    void should_answer_both_and_keep_only_the_newest_usable_when_refreshed_twice_at_once_within_the_grace_given_a_lost_answer() throws Exception {
        Future<?> holder = callers.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            refreshTokens.lockSessionsOf(jana.id());
            held.countDown();
            waitFor(release);
        }));
        assertThat(held.await(30, TimeUnit.SECONDS)).isTrue();

        Future<OAuthTokens> first = callers.submit(() -> authorizationServer.refresh(connectionSecret.value(), CLAUDE.value()));
        Future<OAuthTokens> second = callers.submit(() -> authorizationServer.refresh(connectionSecret.value(), CLAUDE.value()));
        await().until(() -> waitingOnLocks() >= 2);
        release.countDown();
        holder.get(30, TimeUnit.SECONDS);

        List<String> issued = List.of(first.get(30, TimeUnit.SECONDS).refreshToken(), second.get(30, TimeUnit.SECONDS).refreshToken());
        Set<String> usable = usableConnectionSecretHashes();
        assertThat(usable).hasSize(1);
        assertThat(issued.stream().map(this::hashOf).toList()).containsAnyElementsOf(usable);
        assertThat(usable).doesNotContain(hashOf(lostSuccessor));

        String replaced = issued.stream().filter(secret -> !usable.contains(hashOf(secret))).findFirst().orElseThrow();
        assertThatThrownBy(() -> authorizationServer.refresh(replaced, CLAUDE.value())).isInstanceOf(InvalidGrant.class);
        assertThat(usableConnectionSecretHashes()).describedAs("the connection after the replaced token turned up").isEmpty();
        assertThat(refreshTokens.findBySecretHash(hashOf(browserCookie)).orElseThrow().isUsableAt(clock.instant()))
                .describedAs("the browser session of the donor").isFalse();
    }

    private String hashOf(String secret) {
        return RefreshTokenSecret.fromValue(secret).hash();
    }

    private long waitingOnLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                .query(Long.class).single();
    }

    private Set<String> usableConnectionSecretHashes() {
        return refreshTokens.findUsableClientTokensOf(jana.id(), clock.instant()).stream().map(RefreshToken::secretHash)
                .collect(Collectors.toSet());
    }

    private static void waitFor(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
