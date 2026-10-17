package cz.novanadeje.fio;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collections;
import java.util.Map;
import java.util.TreeMap;

import static java.util.Objects.requireNonNull;

public record FioTransaction(
        long id,
        LocalDate date,
        BigDecimal amount,
        String currency,
        String counterpartyAccount,
        String counterpartyBankCode,
        String counterpartyBankName,
        String counterpartyName,
        String constantSymbol,
        String variableSymbol,
        String specificSymbol,
        String userIdentification,
        String type,
        String executedBy,
        String messageForRecipient,
        Long instructionId,
        String detail,
        String comment,
        String bic,
        String payerReference,
        Map<Integer, FioColumn> columns) {

    public FioTransaction {
        requireNonNull(date, "date");
        requireNonNull(amount, "amount");
        requireNonNull(currency, "currency");
        requireNonNull(type, "type");
        columns = Collections.unmodifiableMap(new TreeMap<>(requireNonNull(columns, "columns")));
    }
}
