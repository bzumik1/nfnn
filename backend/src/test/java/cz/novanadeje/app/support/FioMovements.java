package cz.novanadeje.app.support;

import cz.novanadeje.fio.FioTransaction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

public final class FioMovements {

    private static final String INCOMING_TYPE = "Bezhotovostní příjem";
    private static final String OUTGOING_TYPE = "Bezhotovostní platba";

    private final long id;
    private final LocalDate date;
    private final BigDecimal amount;
    private final String type;
    private String currency = "CZK";
    private String counterpartyAccount;
    private String counterpartyBankCode;
    private String counterpartyName;
    private String variableSymbol;
    private String messageForRecipient;

    private FioMovements(long id, LocalDate date, BigDecimal amount, String type) {
        this.id = id;
        this.date = date;
        this.amount = amount;
        this.type = type;
    }

    public static FioMovements incoming(long id, LocalDate date, String amountCzk) {
        return new FioMovements(id, date, new BigDecimal(amountCzk), INCOMING_TYPE);
    }

    public static FioMovements outgoing(long id, LocalDate date, String amountCzk) {
        return new FioMovements(id, date, new BigDecimal(amountCzk).negate(), OUTGOING_TYPE);
    }

    public FioMovements from(String account, String bankCode) {
        this.counterpartyAccount = account;
        this.counterpartyBankCode = bankCode;
        return this;
    }

    public FioMovements named(String name) {
        this.counterpartyName = name;
        return this;
    }

    public FioMovements withVariableSymbol(String symbol) {
        this.variableSymbol = symbol;
        return this;
    }

    public FioMovements withMessage(String message) {
        this.messageForRecipient = message;
        return this;
    }

    public FioMovements inCurrency(String code) {
        this.currency = code;
        return this;
    }

    public FioTransaction build() {
        return new FioTransaction(id, date, amount, currency, counterpartyAccount, counterpartyBankCode, null, counterpartyName,
                null, variableSymbol, null, null, type, null, messageForRecipient, null, null, null, null, null, Map.of());
    }
}
