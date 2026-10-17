package cz.novanadeje.fio;

import java.math.BigDecimal;
import java.time.LocalDate;

import static java.util.Objects.requireNonNull;

public record FioAccountInfo(
        String accountId,
        String bankId,
        String currency,
        String iban,
        String bic,
        BigDecimal openingBalance,
        BigDecimal closingBalance,
        LocalDate dateStart,
        LocalDate dateEnd,
        Long idFrom,
        Long idTo,
        Long idLastDownload) {

    public FioAccountInfo {
        requireNonNull(accountId, "accountId");
        requireNonNull(currency, "currency");
        requireNonNull(iban, "iban");
        requireNonNull(bic, "bic");
        requireNonNull(openingBalance, "openingBalance");
        requireNonNull(closingBalance, "closingBalance");
    }
}
