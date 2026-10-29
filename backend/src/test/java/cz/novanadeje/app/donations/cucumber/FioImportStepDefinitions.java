package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.donations.application.importing.FollowUp;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;
import cz.novanadeje.app.donations.application.importing.ImportReport;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.importing.BankCalendar;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportSettings;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.FakeFioClient;
import cz.novanadeje.app.support.FakeFioClient.RequestedPeriod;
import cz.novanadeje.app.support.FioMovements;
import cz.novanadeje.app.support.MutableClock;
import io.cucumber.java.After;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.github.bzumik1.fio.FioAuthorizationException;
import io.github.bzumik1.fio.FioClient;
import io.github.bzumik1.fio.FioException;
import io.github.bzumik1.fio.FioHistoryLockedException;
import io.github.bzumik1.fio.FioRateLimitException;
import io.github.bzumik1.fio.FioTransportException;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.math.BigDecimal;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class FioImportStepDefinitions {

    private static final String RATE_LIMITED = "the token was used less than 30 seconds ago";
    private static final String HISTORY_LOCKED = "the history older than 90 days is locked";
    private static final String UNAUTHORIZED = "the token is not valid";
    private static final String UNREACHABLE = "Fio is unreachable";
    private static final String REASONS = "(" + RATE_LIMITED + "|" + HISTORY_LOCKED + "|" + UNAUTHORIZED + "|" + UNREACHABLE + ")";
    private static final Map<String, ImportFailureKind> FAILURE_KINDS = Map.of(
            RATE_LIMITED, ImportFailureKind.RATE_LIMITED,
            HISTORY_LOCKED, ImportFailureKind.HISTORY_LOCKED,
            UNAUTHORIZED, ImportFailureKind.UNAUTHORIZED,
            UNREACHABLE, ImportFailureKind.TRANSPORT);
    private static final LocalTime NOON = LocalTime.NOON;

    private final ImportBankPaymentsService importService;
    private final BankPaymentRepository payments;
    private final BankImportStateRepository states;
    private final FakeFioClient fio;
    private final MutableClock clock;
    private final JdbcClient jdbc;
    private final ScenarioDonors scenarioDonors;
    private final List<ImportReport> reports = new ArrayList<>();
    private ImportSettings settings = ImportSettings.defaults();
    private Instant clockBeforeScenarioDate;

    public FioImportStepDefinitions(ImportBankPaymentsService importService, BankPaymentRepository payments, BankImportStateRepository states,
                                    FakeFioClient fio, MutableClock clock, JdbcClient jdbc, ScenarioDonors scenarioDonors) {
        this.importService = importService;
        this.payments = payments;
        this.states = states;
        this.fio = fio;
        this.clock = clock;
        this.jdbc = jdbc;
        this.scenarioDonors = scenarioDonors;
    }

    @After
    public void keepTheClockMovingForward() {
        if (clockBeforeScenarioDate != null && clock.instant().isBefore(clockBeforeScenarioDate)) {
            clock.set(clockBeforeScenarioDate);
        }
    }

    @Given("today is {date}")
    public void todayIs(LocalDate date) {
        if (clockBeforeScenarioDate == null) {
            clockBeforeScenarioDate = clock.instant();
        }
        clock.set(date.atTime(NOON).atZone(BankCalendar.ZONE).toInstant());
    }

    @When("{int} days pass")
    public void daysPass(int days) {
        clock.advance(Duration.ofDays(days));
    }

    @Given("the bank account has these movements:")
    public void theBankAccountHasTheseMovements(List<Map<String, String>> rows) {
        rows.forEach(row -> fio.addMovement(movement(row).build()));
    }

    @Given("the bank account has a movement {long} on {date} with a {int}-character name, a {int}-character message and a {int}-character account")
    public void theBankAccountHasAMovementWithOverlongTexts(long id, LocalDate date, int nameLength, int messageLength, int accountLength) {
        fio.addMovement(FioMovements.incoming(id, date, "500.00")
                .from("1".repeat(accountLength), "2010")
                .named("N".repeat(nameLength))
                .withMessage("M".repeat(messageLength))
                .build());
    }

    @Given("the foundation wants bank history from {date}")
    public void theFoundationWantsBankHistoryFrom(LocalDate from) {
        settings = settings.withHistoryFrom(from);
    }

    @Given("the bank history is unlocked")
    public void theBankHistoryIsUnlocked() {
        fio.unlockHistory();
    }

    @Given("^Fio refuses the next request because " + REASONS + "$")
    public void fioRefusesTheNextRequest(String reason) {
        fio.failNextRequestWith(refusal(reason));
    }

    @Given("the bank reports the period {date} to {date}")
    public void theBankReportsThePeriod(LocalDate start, LocalDate end) {
        fio.reportPeriod(start, end);
    }

    @When("the application starts the import")
    public void theApplicationStartsTheImport() {
        runImport(ImportTrigger.STARTUP);
    }

    @When("the hourly import runs")
    public void theHourlyImportRuns() {
        runImport(ImportTrigger.HOURLY);
    }

    @When("the follow-up import runs")
    public void theFollowUpImportRuns() {
        FollowUp followUp = lastReport().followUp().orElseThrow(() -> new AssertionError("No follow-up import is due"));
        if (clock.instant().isBefore(followUp.at())) {
            clock.set(followUp.at());
        }
        runImport(followUp.trigger());
    }

    @Then("Fio was asked for movements from {date} to {date}")
    public void fioWasAskedForMovementsFrom(LocalDate from, LocalDate to) {
        assertThat(fio.requests()).isNotEmpty().last().isEqualTo(new RequestedPeriod(from, to));
    }

    @Then("Fio was asked {int} times")
    public void fioWasAskedTimes(int times) {
        assertThat(fio.requests()).hasSize(times);
    }

    @Then("the bank-side bookmark was never used")
    public void theBankSideBookmarkWasNeverUsed() {
        assertThat(fio.bookmarkAttempts()).isZero();
    }

    @Then("every import completed")
    public void everyImportCompleted() {
        assertThat(reports).isNotEmpty().allSatisfy(report -> assertThat(report.completed()).isTrue());
    }

    @Then("{int} bank payments are stored")
    public void bankPaymentsAreStored(int count) {
        assertThat(jdbc.sql("select count(*) from bank_payment").query(Long.class).single()).isEqualTo(count);
    }

    @Then("bank payment {long} is stored with {string} CZK received on {date} from {string}")
    public void bankPaymentIsStoredWith(long transactionId, String amount, LocalDate bookedOn, String sender) {
        BankPayment payment = storedPayment(transactionId);
        assertThat(payment.amount()).isEqualTo(Money.of(new BigDecimal(amount), Currency.CZK));
        assertThat(payment.bookedOn()).isEqualTo(bookedOn);
        assertThat(payment.sender()).map(SenderAccount::display).contains(sender);
    }

    @Then("bank payment {long} carries variable symbol {string} matched as {string}")
    public void bankPaymentCarriesVariableSymbol(long transactionId, String raw, String matching) {
        BankPayment payment = storedPayment(transactionId);
        assertThat(payment.variableSymbol()).contains(raw);
        assertThat(payment.matchingVariableSymbol()).contains(new VariableSymbol(matching));
    }

    @Then("bank payment {long} carries variable symbol {string} and no symbol to match")
    public void bankPaymentCarriesVariableSymbolAndNoSymbolToMatch(long transactionId, String raw) {
        BankPayment payment = storedPayment(transactionId);
        assertThat(payment.variableSymbol()).contains(raw);
        assertThat(payment.matchingVariableSymbol()).isEmpty();
        assertThat(payment.carriesVariableSymbol()).isFalse();
    }

    @Then("bank payment {long} is stored with a {int}-character name, a {int}-character message and a {int}-character account")
    public void bankPaymentIsStoredWithCutTexts(long transactionId, int nameLength, int messageLength, int accountLength) {
        BankPayment payment = storedPayment(transactionId);
        assertThat(payment.counterpartyName()).hasValueSatisfying(name -> assertThat(name).hasSize(nameLength));
        assertThat(payment.messageForRecipient()).hasValueSatisfying(message -> assertThat(message).hasSize(messageLength));
        assertThat(payment.counterpartyAccount()).hasValueSatisfying(account -> assertThat(account).hasSize(accountLength));
        assertThat(payment.sender()).isEmpty();
    }

    @Then("no bank payment {long} is stored")
    public void noBankPaymentIsStored(long transactionId) {
        assertThat(payments.findKnownTransactionIds(List.of(new BankTransactionId(transactionId)))).isEmpty();
    }

    @Then("the import reported {int} movements received, {int} new and {int} known")
    public void theImportReported(int received, int fresh, int known) {
        ImportReport report = lastReport();
        assertThat(report.counts().movementsReceived()).isEqualTo(received);
        assertThat(report.counts().incomingNew()).isEqualTo(fresh);
        assertThat(report.counts().incomingKnown()).isEqualTo(known);
    }

    @Then("the import paired {int} by symbol, {int} by account and {int} by confirmed symbol")
    public void theImportPaired(int bySymbol, int byAccount, int byConfirmedSymbol) {
        ImportReport report = lastReport();
        assertThat(report.counts().pairedBySymbol()).isEqualTo(bySymbol);
        assertThat(report.counts().pairedByAccount()).isEqualTo(byAccount);
        assertThat(report.counts().pairedByConfirmedSymbol()).isEqualTo(byConfirmedSymbol);
    }

    @Then("^the import failed because " + REASONS + "$")
    public void theImportFailedBecause(String reason) {
        assertThat(lastReport().failure()).contains(FAILURE_KINDS.get(reason));
    }

    @Then("a follow-up import is due in {int} seconds")
    public void aFollowUpImportIsDueIn(int seconds) {
        assertThat(lastReport().followUp()).map(FollowUp::at).contains(clock.instant().plusSeconds(seconds));
    }

    @Then("no follow-up import is due")
    public void noFollowUpImportIsDue() {
        assertThat(lastReport().followUp()).isEmpty();
    }

    @Then("the bank movements are covered from {date} to {date}")
    public void theBankMovementsAreCoveredFrom(LocalDate from, LocalDate to) {
        assertThat(states.current().coverage()).isEqualTo(new ImportCoverage(from, to));
        assertThat(lastReport().coverage()).isEqualTo(new ImportCoverage(from, to));
    }

    @Then("the import state records the failure")
    public void theImportStateRecordsTheFailure() {
        BankImportState state = states.current();
        assertThat(state.lastFailureKind()).isEqualTo(lastReport().failure());
        assertThat(state.lastFailureMessage()).isPresent();
        assertThat(state.lastAttemptedAt()).isPresent();
    }

    private void runImport(ImportTrigger trigger) {
        reports.add(importService.importIncomingPayments(trigger, settings));
    }

    private ImportReport lastReport() {
        assertThat(reports).withFailMessage("No import has run in this scenario").isNotEmpty();
        return reports.getLast();
    }

    private BankPayment storedPayment(long transactionId) {
        UUID id = jdbc.sql("select id from bank_payment where bank_transaction_id = ?").param(transactionId).query(UUID.class).single();
        return payments.findById(new BankPaymentId(id)).orElseThrow();
    }

    private FioMovements movement(Map<String, String> row) {
        long id = Long.parseLong(row.get("id"));
        LocalDate date = LocalDate.parse(row.get("date"));
        String amount = row.get("amount").trim();
        FioMovements movement = amount.startsWith("-")
                ? FioMovements.outgoing(id, date, amount.substring(1))
                : FioMovements.incoming(id, date, amount);
        movement.from(cell(row, "account"), cell(row, "bankCode"))
                .named(cell(row, "name"))
                .withVariableSymbol(variableSymbolCell(cell(row, "variableSymbol")))
                .withMessage(scenarioDonors.resolve(cell(row, "message")));
        Optional.ofNullable(cell(row, "currency")).ifPresent(movement::inCurrency);
        return movement;
    }

    private String variableSymbolCell(String cell) {
        return scenarioDonors.resolve(cell);
    }

    private static String cell(Map<String, String> row, String column) {
        String value = row.get(column);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private FioException refusal(String reason) {
        return switch (reason) {
            case RATE_LIMITED -> new FioRateLimitException("Fio API request was refused with HTTP 409", "",
                    clock.instant().plus(FioClient.MINIMUM_REQUEST_INTERVAL));
            case HISTORY_LOCKED -> new FioHistoryLockedException("Fio API request was refused with HTTP 422", "");
            case UNAUTHORIZED -> new FioAuthorizationException("Fio API request was refused with HTTP 401", 401, "");
            case UNREACHABLE -> new FioTransportException("Fio API request failed: timed out", new HttpTimeoutException("timed out"), true);
            default -> throw new IllegalArgumentException("Unknown refusal: " + reason);
        };
    }
}
