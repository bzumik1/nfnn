package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.domain.importing.BankCalendar;
import cz.novanadeje.fio.FioAccountInfo;
import cz.novanadeje.fio.FioClient;
import cz.novanadeje.fio.FioException;
import cz.novanadeje.fio.FioHistoryLockedException;
import cz.novanadeje.fio.FioStatement;
import cz.novanadeje.fio.FioTransaction;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class FakeFioClient implements FioClient {

    private static final int LOCKED_AFTER_DAYS = 90;

    private final Clock clock;
    private final List<FioTransaction> ledger = new ArrayList<>();
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
    public synchronized FioStatement transactionsBetween(LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("The period ends on " + to + ", before it starts on " + from);
        }
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
        List<FioTransaction> rows = ledger.stream()
                .filter(row -> !row.date().isBefore(from) && !row.date().isAfter(to))
                .sorted(Comparator.comparingLong(FioTransaction::id))
                .toList();
        return new FioStatement(info(rows), rows);
    }

    @Override
    public synchronized FioStatement newTransactions() {
        bookmarkAttempts++;
        throw bookmarkRefused();
    }

    @Override
    public synchronized void setLastDownloadedId(long transactionId) {
        bookmarkAttempts++;
        throw bookmarkRefused();
    }

    @Override
    public synchronized void setLastDownloadedDate(LocalDate date) {
        bookmarkAttempts++;
        throw bookmarkRefused();
    }

    public synchronized void addMovement(FioTransaction movement) {
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

    private FioAccountInfo info(List<FioTransaction> rows) {
        LocalDate start = reportedStart != null ? reportedStart : rows.stream().map(FioTransaction::date).min(Comparator.naturalOrder()).orElse(null);
        LocalDate end = reportedEnd != null ? reportedEnd : rows.stream().map(FioTransaction::date).max(Comparator.naturalOrder()).orElse(null);
        Long idFrom = rows.isEmpty() ? null : rows.getFirst().id();
        Long idTo = rows.isEmpty() ? null : rows.getLast().id();
        return new FioAccountInfo("5544332217", "2010", "CZK", "CZ2620100000005544332217", "FIOBCZPPXXX",
                BigDecimal.ZERO, BigDecimal.ZERO, start, end, idFrom, idTo, null);
    }

    private static UnsupportedOperationException bookmarkRefused() {
        return new UnsupportedOperationException("the import must not use the bank-side bookmark");
    }

    public record RequestedPeriod(LocalDate from, LocalDate to) {
    }
}
