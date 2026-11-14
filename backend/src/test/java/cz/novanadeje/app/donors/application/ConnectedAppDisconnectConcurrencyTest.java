package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ConnectedAppNotFound;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
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
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Consumer;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class ConnectedAppDisconnectConcurrencyTest {

    private static final ClientId CLAUDE = new ClientId("https://claude.ai/.well-known/oauth-client");

    @Autowired
    private ConnectedAppsService connectedApps;
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
    private RefreshToken connection;
    private String browserCookie;

    @BeforeEach
    void anAdministratorWithAConnectedApplicationAndABrowserSession() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        jana = Donor.register(DonorId.newId(clock.instant()), DonorType.PERSON, new DonorName("Jana Nováková"), null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress("jana@example.cz"), new PasswordHash("$hash"),
                new VariableSymbol("4821937560"), LocaleCode.CS, clock.instant());
        jana.verifyEmail(clock.instant());
        jana.grantAdministration(true);
        connectionSecret = RefreshTokenSecret.generate();
        connection = RefreshToken.issueForClient(connectionSecret, jana.id(), CLAUDE, Set.of(OAuthScope.ADMIN_READ), clock.instant(), clock.instant(),
                Duration.ofDays(14));
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.executeWithoutResult(status -> {
            donors.save(jana);
            refreshTokens.save(connection);
        });
        browserCookie = transaction.execute(status -> sessions.signIn(jana, true, DeviceDescription.UNKNOWN, SessionKind.REMEMBERED).refreshToken());
    }

    @AfterEach
    void releaseTheCallers() {
        release.countDown();
        callers.shutdownNow();
    }

    @Test
    @DisplayName("Given a refresh of a connected application that read its token before a disconnect of it committed, when both finish, then the disconnect never reports success while a token of the application stays usable")
    void should_leave_no_usable_token_after_a_reported_disconnect_when_refreshed_and_disconnected_at_once_given_the_refresh_read_first()
            throws Exception {
        Future<?> holder = hold(status -> refreshTokens.lockSessionsOf(jana.id()));

        Future<OAuthTokens> refresh = callers.submit(() -> authorizationServer.refresh(connectionSecret.value(), CLAUDE.value()));
        awaitWaitingOnLocks(1);
        Future<?> disconnect = callers.submit(() -> connectedApps.disconnect(jana.id(), connection.id()));
        await().until(() -> disconnect.isDone() || waitingOnLocks() >= 2);
        release.countDown();
        holder.get(30, TimeUnit.SECONDS);

        String successor = refresh.get(30, TimeUnit.SECONDS).refreshToken();
        Optional<Throwable> disconnectFailure = failureOf(disconnect);

        assertThat(disconnectFailure).describedAs("a disconnect that reports success must leave no usable token of the application")
                .containsInstanceOf(ConnectedAppNotFound.class);
        assertThat(usableConnectionSecretHashes()).containsExactly(RefreshTokenSecret.fromValue(successor).hash());
    }

    @Test
    @DisplayName("Given a disconnect that read the connected application's token before a refresh spent it, when both finish, then the token stays recorded as used and the disconnect never reports success while the successor stays usable")
    void should_keep_the_token_used_when_refreshed_and_disconnected_at_once_given_the_disconnect_read_first() throws Exception {
        Future<?> holder = hold(status -> jdbc.sql("select id from donor_refresh_token where id = ? for update").param(connection.id())
                .query(Object.class).single());

        Future<OAuthTokens> refresh = callers.submit(() -> authorizationServer.refresh(connectionSecret.value(), CLAUDE.value()));
        awaitWaitingOnLocks(1);
        Future<?> disconnect = callers.submit(() -> connectedApps.disconnect(jana.id(), connection.id()));
        awaitWaitingOnLocks(2);
        release.countDown();
        holder.get(30, TimeUnit.SECONDS);

        String successor = refresh.get(30, TimeUnit.SECONDS).refreshToken();
        Optional<Throwable> disconnectFailure = failureOf(disconnect);

        assertThat(isUsed(connection)).describedAs("used_at of the spent token").isTrue();
        assertThat(disconnectFailure).describedAs("a disconnect that reports success must leave no usable token of the application")
                .containsInstanceOf(ConnectedAppNotFound.class);
        assertThat(usableConnectionSecretHashes()).containsExactly(RefreshTokenSecret.fromValue(successor).hash());
    }

    @Test
    @DisplayName("Given a disconnect of a connected application waiting for the donor's sessions before a refresh of it, when both finish, then the refresh is refused, no token of the application stays usable and no other session of the donor ends")
    void should_refuse_the_refresh_without_ending_other_sessions_when_refreshed_and_disconnected_at_once_given_the_disconnect_came_first()
            throws Exception {
        Future<?> holder = hold(status -> refreshTokens.lockSessionsOf(jana.id()));

        Future<?> disconnect = callers.submit(() -> connectedApps.disconnect(jana.id(), connection.id()));
        await().until(() -> disconnect.isDone() || waitingOnLocks() >= 1);
        long waitingBeforeTheRefresh = waitingOnLocks();
        Future<OAuthTokens> refresh = callers.submit(() -> authorizationServer.refresh(connectionSecret.value(), CLAUDE.value()));
        awaitWaitingOnLocks(waitingBeforeTheRefresh + 1);
        release.countDown();
        holder.get(30, TimeUnit.SECONDS);

        disconnect.get(30, TimeUnit.SECONDS);
        assertThat(failureOf(refresh)).containsInstanceOf(InvalidGrant.class);
        assertThat(usableConnectionSecretHashes()).isEmpty();
        assertThat(refreshTokens.findBySecretHash(RefreshTokenSecret.fromValue(browserCookie).hash()).orElseThrow().isUsableAt(clock.instant()))
                .describedAs("the browser session of the donor").isTrue();
    }

    private static Optional<Throwable> failureOf(Future<?> caller) throws InterruptedException, TimeoutException {
        try {
            caller.get(30, TimeUnit.SECONDS);
            return Optional.empty();
        } catch (ExecutionException failed) {
            return Optional.of(failed.getCause());
        }
    }

    private Future<?> hold(Consumer<Object> lock) throws InterruptedException {
        Future<?> holder = callers.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            lock.accept(status);
            held.countDown();
            waitFor(release);
        }));
        assertThat(held.await(30, TimeUnit.SECONDS)).isTrue();
        return holder;
    }

    private void awaitWaitingOnLocks(long count) {
        await().until(() -> waitingOnLocks() >= count);
    }

    private long waitingOnLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                .query(Long.class).single();
    }

    private Set<String> usableConnectionSecretHashes() {
        return refreshTokens.findUsableClientTokensOf(jana.id(), clock.instant()).stream().map(RefreshToken::secretHash)
                .collect(Collectors.toSet());
    }

    private boolean isUsed(RefreshToken token) {
        return jdbc.sql("select used_at is not null from donor_refresh_token where id = ?").param(token.id()).query(Boolean.class).single();
    }

    private static void waitFor(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
