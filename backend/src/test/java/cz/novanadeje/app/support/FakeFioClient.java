package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.domain.importing.BankCalendar;
import io.github.bzumik1.fio.AccountInfo;
import io.github.bzumik1.fio.AccountStatement;
import io.github.bzumik1.fio.Download;
import io.github.bzumik1.fio.DomesticAccount;
import io.github.bzumik1.fio.FioClient;
import io.github.bzumik1.fio.FioException;
import io.github.bzumik1.fio.FioHistoryLockedException;
import io.github.bzumik1.fio.Money;
import io.github.bzumik1.fio.Transaction;
import io.github.bzumik1.fio.TransactionFormat;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Currency;
import java.util.List;

public class FakeFioClient implements FioClient {

    private static final int LOCKED_AFTER_DAYS = 90;
    private static final Currency CZK = Currency.getInstance("CZK");

    private final Clock clock;
    private final List<Transaction> ledger = new ArrayList<>();
    private final List<RequestedPeriod> requests = new ArrayList<>();
    private int bookmarkAttempts;
    private FioException nextFailure;
    private boolean historyUnlocked;
    private LocalDate reportedStart;
    private LocalDate reportedEnd;

    public FakeFioClient(Clock clock) {
        this.clock = clock;
    }

    @Override
    public Transactions transactions() {
        return new Transactions() {
            @Override
            public TransactionRequest between(LocalDate from, LocalDate to) {
                if (to.isBefore(from)) {
                    throw new IllegalArgumentException("The period ends on " + to + ", before it starts on " + from);
                }
                return new PeriodRequest(from, to);
            }

            @Override
            public TransactionRequest sinceBookmark() {
                throw bookmarkUsed();
            }
        };
    }

    @Override
    public Bookmark bookmark() {
        return new Bookmark() {
            @Override
            public void moveAfterTransaction(long transactionId) {
                throw bookmarkUsed();
            }

            @Override
            public void moveToDate(LocalDate date) {
                throw bookmarkUsed();
            }
        };
    }

    @Override
    public Statements statements() {
        throw notUsedByTheImport("official statements");
    }

    @Override
    public Merchant merchant() {
        throw notUsedByTheImport("merchant card transactions");
    }

    @Override
    public Payments payments() {
        throw notUsedByTheImport("payment orders");
    }

    public synchronized void addMovement(Transaction movement) {
        ledger.add(movement);
    }

    public synchronized void unlockHistory() {
        historyUnlocked = true;
    }

    public synchronized void failNextRequestWith(FioException failure) {
        nextFailure = failure;
    }

    public synchronized void reportPeriod(LocalDate start, LocalDate end) {
        reportedStart = start;
        reportedEnd = end;
    }

    public synchronized List<RequestedPeriod> requests() {
        return List.copyOf(requests);
    }

    public synchronized int bookmarkAttempts() {
        return bookmarkAttempts;
    }

    public synchronized void reset() {
        ledger.clear();
        requests.clear();
        bookmarkAttempts = 0;
        nextFailure = null;
        historyUnlocked = false;
        reportedStart = null;
        reportedEnd = null;
    }

    private synchronized AccountStatement fetch(LocalDate from, LocalDate to) {
        requests.add(new RequestedPeriod(from, to));
        if (nextFailure != null) {
            FioException failure = nextFailure;
            nextFailure = null;
            throw failure;
        }
        if (!historyUnlocked && from.isBefore(BankCalendar.today(clock).minusDays(LOCKED_AFTER_DAYS))) {
            throw new FioHistoryLockedException("Fio API request GET /periods/***/" + from + "/" + to
                    + "/transactions.json was refused with HTTP 422: movements older than 90 days need the full history unlocked", "");
        }
        List<Transaction> rows = ledger.stream()
                .filter(row -> !row.date().isBefore(from) && !row.date().isAfter(to))
                .sorted(Comparator.comparingLong(Transaction::id))
                .toList();
        return new AccountStatement(info(from, to, rows), rows);
    }

    private synchronized UnsupportedOperationException bookmarkUsed() {
        bookmarkAttempts++;
        return new UnsupportedOperationException("the import must not use the bank-side bookmark");
    }

    private AccountInfo info(LocalDate from, LocalDate to, List<Transaction> rows) {
        LocalDate start = reportedStart != null ? reportedStart : from;
        LocalDate end = reportedEnd != null ? reportedEnd : to;
        Long firstId = rows.isEmpty() ? null : rows.getFirst().id();
        Long lastId = rows.isEmpty() ? null : rows.getLast().id();
        Money zero = Money.czk("0.00");
        return new AccountInfo(DomesticAccount.of("5544332217", "2010"), "CZ2620100000005544332217", "FIOBCZPPXXX", CZK,
                zero, zero, start, end, null, firstId, lastId, null);
    }

    private static UnsupportedOperationException notUsedByTheImport(String part) {
        return new UnsupportedOperationException("the import does not use the " + part + " of the Fio API");
    }

    private final class PeriodRequest implements TransactionRequest {

        private final LocalDate from;
        private final LocalDate to;

        private PeriodRequest(LocalDate from, LocalDate to) {
            this.from = from;
            this.to = to;
        }

        @Override
        public AccountStatement fetch() {
            return FakeFioClient.this.fetch(from, to);
        }

        @Override
        public Download download(TransactionFormat format) {
            throw notUsedByTheImport("raw " + format + " download");
        }
    }

    public record RequestedPeriod(LocalDate from, LocalDate to) {
    }
}
