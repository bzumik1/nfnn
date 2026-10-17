package cz.novanadeje.app.donations.infrastructure.fio;

import cz.novanadeje.app.donations.application.importing.BankStatement;
import cz.novanadeje.app.donations.application.importing.BankStatementUnavailable;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.FioMovements;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.fio.FioAccountInfo;
import cz.novanadeje.fio.FioAuthorizationException;
import cz.novanadeje.fio.FioClient;
import cz.novanadeje.fio.FioException;
import cz.novanadeje.fio.FioHistoryLockedException;
import cz.novanadeje.fio.FioRateLimitException;
import cz.novanadeje.fio.FioStatement;
import cz.novanadeje.fio.FioTransaction;
import cz.novanadeje.fio.FioTransportException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class FioBankStatementSourceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final LocalDate DAY = LocalDate.of(2026, 10, 15);
    private static final ImportPeriod REQUESTED = new ImportPeriod(LocalDate.of(2026, 7, 20), LocalDate.of(2026, 10, 17));

    private MutableClock clock;
    private StubFioClient fio;
    private FioBankStatementSource source;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(NOW, ZoneId.of("UTC"));
        fio = new StubFioClient();
        source = new FioBankStatementSource(fio, clock);
    }

    @Test
    @DisplayName("Given a requested period, when the statement is fetched, then Fio is asked for exactly that period")
    void should_ask_for_requested_period_when_fetched() {
        fio.answer(statement(null, null));

        source.fetch(REQUESTED);

        assertThat(fio.requested).containsExactly(REQUESTED.from(), REQUESTED.to());
    }

    @Test
    @DisplayName("Given incoming, outgoing, zero and EUR movements, when the statement is fetched, then only the incoming CZK one is kept and all are counted")
    void should_keep_only_incoming_czk_when_fetched_given_mixed_movements() {
        fio.answer(statement(null, null,
                FioMovements.incoming(1001, DAY, "500.00").from("2900233333", "2010").named("Nováková Jana").build(),
                FioMovements.outgoing(1002, DAY, "300.00").from("2900233333", "2010").build(),
                FioMovements.incoming(1003, DAY, "0.00").build(),
                FioMovements.incoming(1004, DAY, "20.00").inCurrency("EUR").build()));

        BankStatement statement = source.fetch(REQUESTED);

        assertThat(statement.movementsReceived()).isEqualTo(4);
        assertThat(statement.incoming()).singleElement().satisfies(movement -> {
            assertThat(movement.id()).isEqualTo(new BankTransactionId(1001));
            assertThat(movement.bookedOn()).isEqualTo(DAY);
            assertThat(movement.amount()).isEqualTo(Money.czk(50000));
            assertThat(movement.sender()).contains(new SenderAccount("2900233333", "2010"));
            assertThat(movement.counterpartyName()).contains("Nováková Jana");
            assertThat(movement.transactionType()).isEqualTo("Bezhotovostní příjem");
        });
        assertThat(statement.requested()).isEqualTo(REQUESTED);
    }

    @Test
    @DisplayName("Given an amount with more than two decimals, when the statement is fetched, then the movement is skipped but counted")
    void should_skip_but_count_when_fetched_given_amount_finer_than_hundredths() {
        fio.answer(statement(null, null, FioMovements.incoming(1001, DAY, "1.005").build(), FioMovements.incoming(1002, DAY, "500.000").build()));

        BankStatement statement = source.fetch(REQUESTED);

        assertThat(statement.movementsReceived()).isEqualTo(2);
        assertThat(statement.incoming()).extracting(IncomingMovement::id).containsExactly(new BankTransactionId(1002));
    }

    @Test
    @DisplayName("Given a symbol with leading zeros, when the statement is fetched, then the raw symbol is kept and the matching form derived")
    void should_keep_raw_symbol_and_derive_matching_form_when_fetched_given_padded_symbol() {
        fio.answer(statement(null, null, FioMovements.incoming(1001, DAY, "500.00").withVariableSymbol("0004821937560").build()));

        IncomingMovement movement = source.fetch(REQUESTED).incoming().getFirst();

        assertThat(movement.variableSymbol()).contains("0004821937560");
        assertThat(movement.matchingVariableSymbol()).contains(new VariableSymbol("4821937560"));
    }

    @Test
    @DisplayName("Given a foreign payer, when the statement is fetched, then the movement has no Czech sender but keeps the raw account")
    void should_have_no_sender_when_fetched_given_foreign_account() {
        fio.answer(statement(null, null, FioMovements.incoming(1001, DAY, "500.00").from("DE89370400440532013000", null).build()));

        IncomingMovement movement = source.fetch(REQUESTED).incoming().getFirst();

        assertThat(movement.sender()).isEmpty();
        assertThat(movement.counterpartyAccount()).contains("DE89370400440532013000");
        assertThat(movement.counterpartyBankCode()).isEmpty();
    }

    @Test
    @DisplayName("Given the bank reports both dates, when the statement is fetched, then the reported period is carried")
    void should_carry_reported_period_when_fetched_given_both_dates() {
        fio.answer(statement(LocalDate.of(2026, 7, 21), LocalDate.of(2026, 10, 16)));

        assertThat(source.fetch(REQUESTED).reported()).contains(new ImportPeriod(LocalDate.of(2026, 7, 21), LocalDate.of(2026, 10, 16)));
    }

    @Test
    @DisplayName("Given the bank reports no dates or only one, when the statement is fetched, then no reported period is carried")
    void should_have_no_reported_period_when_fetched_given_missing_dates() {
        fio.answer(statement(null, null));
        assertThat(source.fetch(REQUESTED).reported()).isEmpty();

        fio.answer(statement(LocalDate.of(2026, 7, 21), null));
        assertThat(source.fetch(REQUESTED).reported()).isEmpty();
    }

    @Test
    @DisplayName("Given the 30-second limit, when the statement is fetched, then it is unavailable as rate limited with the bank's retry time")
    void should_map_rate_limit_when_fetched_given_409() {
        Instant retryAfter = NOW.plusSeconds(30);
        FioRateLimitException refusal = new FioRateLimitException("refused with HTTP 409", "", retryAfter);
        fio.fail(refusal);

        BankStatementUnavailable unavailable = unavailable();

        assertThat(unavailable.kind()).isEqualTo(ImportFailureKind.RATE_LIMITED);
        assertThat(unavailable.retryAfter()).contains(retryAfter);
        assertThat(unavailable).hasMessage("refused with HTTP 409").hasCause(refusal);
    }

    @Test
    @DisplayName("Given a locked history, when the statement is fetched, then it is unavailable as history locked, retryable 30 seconds after the refusal arrived")
    void should_map_history_lock_with_retry_from_catch_instant_when_fetched_given_422() {
        fio.beforeAnswer(() -> clock.advance(Duration.ofSeconds(7)));
        fio.fail(new FioHistoryLockedException("refused with HTTP 422", ""));

        BankStatementUnavailable unavailable = unavailable();

        assertThat(unavailable.kind()).isEqualTo(ImportFailureKind.HISTORY_LOCKED);
        assertThat(unavailable.retryAfter()).contains(NOW.plusSeconds(37));
    }

    @Test
    void should_map_unauthorized_when_fetched_given_rejected_token() {
        fio.fail(new FioAuthorizationException("refused with HTTP 500", 500, ""));

        BankStatementUnavailable unavailable = unavailable();

        assertThat(unavailable.kind()).isEqualTo(ImportFailureKind.UNAUTHORIZED);
        assertThat(unavailable.retryAfter()).isEmpty();
    }

    @Test
    void should_map_transport_when_fetched_given_timeout() {
        fio.fail(new FioTransportException("Fio API request GET /periods/***/ failed: timed out", new HttpTimeoutException("timed out")));

        assertThat(unavailable().kind()).isEqualTo(ImportFailureKind.TRANSPORT);
    }

    @Test
    void should_map_invalid_response_when_fetched_given_2xx_body_that_is_not_a_statement() {
        fio.fail(new FioException("answered with HTTP 200 and a body that is not an account statement", 200, "<html>", new IOException("x")));

        assertThat(unavailable().kind()).isEqualTo(ImportFailureKind.INVALID_RESPONSE);
    }

    @Test
    void should_map_unexpected_when_fetched_given_other_status() {
        fio.fail(new FioException("refused with HTTP 413", 413, ""));
        assertThat(unavailable().kind()).isEqualTo(ImportFailureKind.UNEXPECTED);

        fio.fail(new FioException("refused with HTTP 404", 404, ""));
        assertThat(unavailable().kind()).isEqualTo(ImportFailureKind.UNEXPECTED);
    }

    private BankStatementUnavailable unavailable() {
        return catchThrowableOfType(BankStatementUnavailable.class, () -> source.fetch(REQUESTED));
    }

    private static FioStatement statement(LocalDate dateStart, LocalDate dateEnd, FioTransaction... rows) {
        return new FioStatement(new FioAccountInfo("5544332217", "2010", "CZK", "CZ2620100000005544332217", "FIOBCZPPXXX",
                BigDecimal.ZERO, BigDecimal.ZERO, dateStart, dateEnd, null, null, null), List.of(rows));
    }

    private static final class StubFioClient implements FioClient {

        private List<LocalDate> requested = List.of();
        private FioStatement answer;
        private FioException failure;
        private Runnable beforeAnswer = () -> {
        };

        void answer(FioStatement statement) {
            this.answer = statement;
            this.failure = null;
        }

        void fail(FioException exception) {
            this.failure = exception;
        }

        void beforeAnswer(Runnable action) {
            this.beforeAnswer = action;
        }

        @Override
        public FioStatement transactionsBetween(LocalDate from, LocalDate to) {
            requested = List.of(from, to);
            beforeAnswer.run();
            if (failure != null) {
                throw failure;
            }
            return Optional.ofNullable(answer).orElseThrow();
        }

        @Override
        public FioStatement newTransactions() {
            throw new UnsupportedOperationException();
        }

        @Override
        public void setLastDownloadedId(long transactionId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void setLastDownloadedDate(LocalDate date) {
            throw new UnsupportedOperationException();
        }
    }
}
