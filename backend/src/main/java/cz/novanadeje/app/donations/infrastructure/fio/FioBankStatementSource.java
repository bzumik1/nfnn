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
import cz.novanadeje.fio.FioAccountInfo;
import cz.novanadeje.fio.FioAuthorizationException;
import cz.novanadeje.fio.FioClient;
import cz.novanadeje.fio.FioException;
import cz.novanadeje.fio.FioHistoryLockedException;
import cz.novanadeje.fio.FioRateLimitException;
import cz.novanadeje.fio.FioStatement;
import cz.novanadeje.fio.FioTransaction;
import cz.novanadeje.fio.FioTransportException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Component
class FioBankStatementSource implements BankStatementSource {

    private static final Logger log = LoggerFactory.getLogger(FioBankStatementSource.class);

    private final FioClient client;
    private final Clock clock;

    FioBankStatementSource(FioClient client, Clock clock) {
        this.client = client;
        this.clock = clock;
    }

    @Override
    public BankStatement fetch(ImportPeriod requested) {
        FioStatement statement = download(requested);
        FioAccountInfo info = statement.info();
        log.info("Fio answered {}: reported {}/{} ids {}-{}, {} movements", requested, info.dateStart(), info.dateEnd(),
                info.idFrom(), info.idTo(), statement.transactions().size());
        List<IncomingMovement> incoming = statement.transactions().stream()
                .map(this::incoming)
                .flatMap(Optional::stream)
                .toList();
        return new BankStatement(requested, reported(info), incoming, statement.transactions().size());
    }

    private FioStatement download(ImportPeriod requested) {
        try {
            return client.transactionsBetween(requested.from(), requested.to());
        } catch (FioRateLimitException e) {
            throw unavailable(ImportFailureKind.RATE_LIMITED, Optional.of(e.retryAfter()), e);
        } catch (FioHistoryLockedException e) {
            Instant refusedAt = clock.instant();
            throw unavailable(ImportFailureKind.HISTORY_LOCKED, Optional.of(refusedAt.plus(FioClient.MINIMUM_REQUEST_INTERVAL)), e);
        } catch (FioAuthorizationException e) {
            throw unavailable(ImportFailureKind.UNAUTHORIZED, Optional.empty(), e);
        } catch (FioTransportException e) {
            throw unavailable(ImportFailureKind.TRANSPORT, Optional.empty(), e);
        } catch (FioException e) {
            throw unavailable(answeredSuccessfully(e) ? ImportFailureKind.INVALID_RESPONSE : ImportFailureKind.UNEXPECTED, Optional.empty(), e);
        }
    }

    private Optional<IncomingMovement> incoming(FioTransaction transaction) {
        if (transaction.amount().signum() <= 0) {
            return Optional.empty();
        }
        if (!Currency.CZK.name().equals(transaction.currency().trim().toUpperCase(Locale.ROOT))) {
            log.warn("Fio movement {} is in {}, not CZK; it is not imported", transaction.id(), transaction.currency());
            return Optional.empty();
        }
        Optional<Money> amount = czk(transaction);
        if (amount.isEmpty()) {
            log.warn("Fio movement {} has an amount that is not a whole number of hellers; it is not imported", transaction.id());
            return Optional.empty();
        }
        log.debug("Fio movement {} from {}/{} ({}) with variable symbol {}", transaction.id(), transaction.counterpartyAccount(),
                transaction.counterpartyBankCode(), transaction.counterpartyName(), transaction.variableSymbol());
        return Optional.of(IncomingMovement.of(
                new BankTransactionId(transaction.id()),
                transaction.date(),
                amount.get(),
                SenderAccount.parse(transaction.counterpartyAccount(), transaction.counterpartyBankCode()),
                Optional.ofNullable(transaction.counterpartyAccount()),
                Optional.ofNullable(transaction.counterpartyBankCode()),
                Optional.ofNullable(transaction.counterpartyName()),
                Optional.ofNullable(transaction.variableSymbol()),
                Optional.ofNullable(transaction.constantSymbol()),
                Optional.ofNullable(transaction.specificSymbol()),
                Optional.ofNullable(transaction.messageForRecipient()),
                transaction.type()));
    }

    private static Optional<Money> czk(FioTransaction transaction) {
        try {
            return Optional.of(Money.of(transaction.amount(), Currency.CZK));
        } catch (ArithmeticException notRepresentable) {
            return Optional.empty();
        }
    }

    private static Optional<ImportPeriod> reported(FioAccountInfo info) {
        if (info.dateStart() == null || info.dateEnd() == null || info.dateEnd().isBefore(info.dateStart())) {
            return Optional.empty();
        }
        return Optional.of(new ImportPeriod(info.dateStart(), info.dateEnd()));
    }

    private static boolean answeredSuccessfully(FioException e) {
        return e.statusCode().stream().anyMatch(status -> status / 100 == 2);
    }

    private static BankStatementUnavailable unavailable(ImportFailureKind kind, Optional<Instant> retryAfter, FioException cause) {
        return new BankStatementUnavailable(kind, retryAfter, cause.getMessage(), cause);
    }
}
