package cz.novanadeje.app.donations.infrastructure.fio;

import cz.novanadeje.app.donations.application.importing.BankStatement;
import cz.novanadeje.app.donations.application.importing.BankStatementSource;
import cz.novanadeje.app.donations.application.importing.BankStatementUnavailable;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;
import io.github.bzumik1.fio.AccountInfo;
import io.github.bzumik1.fio.AccountStatement;
import io.github.bzumik1.fio.FioAuthorizationException;
import io.github.bzumik1.fio.FioClient;
import io.github.bzumik1.fio.FioException;
import io.github.bzumik1.fio.FioHistoryLockedException;
import io.github.bzumik1.fio.FioRateLimitException;
import io.github.bzumik1.fio.FioResponseTooLargeException;
import io.github.bzumik1.fio.FioTransportException;
import io.github.bzumik1.fio.Transaction;
import io.github.bzumik1.fio.TransactionColumn;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Component
class FioBankStatementSource implements BankStatementSource {

    private static final Logger log = LoggerFactory.getLogger(FioBankStatementSource.class);
    private static final int COUNTERPARTY_ACCOUNT_COLUMN = 2;
    private static final int COUNTERPARTY_BANK_CODE_COLUMN = 3;

    private final FioClient client;
    private final Clock clock;

    FioBankStatementSource(FioClient client, Clock clock) {
        this.client = client;
        this.clock = clock;
    }

    @Override
    public BankStatement fetch(ImportPeriod requested) {
        AccountStatement statement = download(requested);
        AccountInfo info = statement.info();
        log.info("Fio answered {}: reported {}/{} ids {}-{}, {} movements", requested, info.dateStart(), info.dateEnd(),
                info.firstTransactionId(), info.lastTransactionId(), statement.transactions().size());
        List<IncomingMovement> incoming = statement.transactions().stream()
                .map(this::incoming)
                .flatMap(Optional::stream)
                .toList();
        return new BankStatement(requested, reported(info), incoming, statement.transactions().size(), closingBalance(info, requested));
    }

    private AccountStatement download(ImportPeriod requested) {
        try {
            return client.transactions().between(requested.from(), requested.to()).fetch();
        } catch (FioException e) {
            throw unavailable(e);
        }
    }

    private BankStatementUnavailable unavailable(FioException failure) {
        return switch (failure) {
            case FioRateLimitException limited -> unavailable(ImportFailureKind.RATE_LIMITED, Optional.of(limited.retryAfter()), limited);
            case FioHistoryLockedException locked ->
                    unavailable(ImportFailureKind.HISTORY_LOCKED, Optional.of(clock.instant().plus(FioClient.MINIMUM_REQUEST_INTERVAL)), locked);
            case FioAuthorizationException refused -> unavailable(ImportFailureKind.UNAUTHORIZED, Optional.empty(), refused);
            case FioTransportException unreachable -> unavailable(ImportFailureKind.TRANSPORT, Optional.empty(), unreachable);
            case FioException other ->
                    unavailable(answeredSuccessfully(other) ? ImportFailureKind.INVALID_RESPONSE : ImportFailureKind.UNEXPECTED, Optional.empty(), other);
        };
    }

    private Optional<IncomingMovement> incoming(Transaction transaction) {
        if (!transaction.isIncoming()) {
            return Optional.empty();
        }
        String currency = transaction.amount().currency().getCurrencyCode();
        if (!Currency.CZK.name().equals(currency)) {
            log.warn("Fio movement {} is in {}, not CZK; it is not imported", transaction.id(), currency);
            return Optional.empty();
        }
        Optional<Money> amount = czk(transaction);
        if (amount.isEmpty()) {
            log.warn("Fio movement {} has an amount that is not a whole number of hellers; it is not imported", transaction.id());
            return Optional.empty();
        }
        Optional<String> account = sent(transaction, COUNTERPARTY_ACCOUNT_COLUMN);
        Optional<String> bankCode = sent(transaction, COUNTERPARTY_BANK_CODE_COLUMN);
        log.debug("Fio movement {} is incoming: sender account {}, payer name {}, variable symbol {}", transaction.id(),
                givenOrMissing(account.isPresent()), givenOrMissing(isGiven(transaction.counterparty().name())),
                givenOrMissing(isGiven(transaction.symbols().variable())));
        return Optional.of(IncomingMovement.of(
                new BankTransactionId(transaction.id()),
                transaction.date(),
                amount.get(),
                SenderAccount.parse(account.orElse(null), bankCode.orElse(null)),
                account,
                bankCode,
                Optional.ofNullable(transaction.counterparty().name()),
                Optional.ofNullable(transaction.symbols().variable()),
                Optional.ofNullable(transaction.symbols().constant()),
                Optional.ofNullable(transaction.symbols().specific()),
                Optional.ofNullable(transaction.messageForRecipient()),
                transaction.typeLabel()));
    }

    private static boolean isGiven(String value) {
        return value != null && !value.isBlank();
    }

    private static String givenOrMissing(boolean given) {
        return given ? "given" : "missing";
    }

    private static Optional<String> sent(Transaction transaction, int column) {
        return Optional.ofNullable(transaction.columns().get(column))
                .map(TransactionColumn::value)
                .filter(value -> !value.isBlank());
    }

    private static Optional<Money> czk(Transaction transaction) {
        try {
            return Optional.of(Money.of(transaction.amount().amount(), Currency.CZK));
        } catch (ArithmeticException notRepresentable) {
            return Optional.empty();
        }
    }

    private static Optional<Money> closingBalance(AccountInfo info, ImportPeriod requested) {
        if (!requested.to().equals(info.dateEnd())) {
            return Optional.empty();
        }
        String currency = info.currency().getCurrencyCode();
        if (!Currency.CZK.name().equals(currency)) {
            log.warn("Fio reported the account in {}, not CZK; the account balance is not read", currency);
            return Optional.empty();
        }
        try {
            return Optional.of(Money.of(info.closingBalance().amount(), Currency.CZK));
        } catch (ArithmeticException notRepresentable) {
            log.warn("Fio reported a closing balance that is not a whole number of hellers; the account balance is not read");
            return Optional.empty();
        }
    }

    private static Optional<ImportPeriod> reported(AccountInfo info) {
        if (info.dateStart() == null || info.dateEnd() == null || info.dateEnd().isBefore(info.dateStart())) {
            return Optional.empty();
        }
        return Optional.of(new ImportPeriod(info.dateStart(), info.dateEnd()));
    }

    private static boolean answeredSuccessfully(FioException e) {
        return e.statusCode().stream().anyMatch(status -> status / 100 == 2);
    }

    private static BankStatementUnavailable unavailable(ImportFailureKind kind, Optional<Instant> retryAfter, FioException cause) {
        return new BankStatementUnavailable(kind, retryAfter, description(cause), cause);
    }

    private static String description(FioException failure) {
        return switch (failure) {
            case FioTransportException unreachable -> "Fio API request failed: " + causeName(unreachable);
            case FioResponseTooLargeException ignored -> "Fio API answered with more than this client reads";
            case FioException answered when answered.statusCode().isPresent() -> statusDescription(answered.statusCode().getAsInt());
            case FioRateLimitException ignored -> "Fio API request was not sent: the token was used too recently";
            case FioException other -> "Fio API request failed: " + other.getClass().getSimpleName();
        };
    }

    private static String statusDescription(int status) {
        if (status / 100 == 2) {
            return "Fio API answered with HTTP " + status + " and a body this client does not understand";
        }
        return "Fio API request was refused with HTTP " + status;
    }

    private static String causeName(FioTransportException unreachable) {
        Throwable cause = unreachable.getCause();
        return (cause == null ? unreachable : cause).getClass().getSimpleName();
    }
}
