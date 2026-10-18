package cz.novanadeje.app.support;

import io.github.bzumik1.fio.BankAccount;
import io.github.bzumik1.fio.Counterparty;
import io.github.bzumik1.fio.DomesticAccount;
import io.github.bzumik1.fio.ForeignAccount;
import io.github.bzumik1.fio.Money;
import io.github.bzumik1.fio.PaymentSymbols;
import io.github.bzumik1.fio.Transaction;
import io.github.bzumik1.fio.TransactionColumn;
import io.github.bzumik1.fio.TransactionType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Currency;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

public final class FioMovements {

    private static final String INCOMING_TYPE = "Bezhotovostní příjem";
    private static final String OUTGOING_TYPE = "Bezhotovostní platba";
    private static final Pattern DOMESTIC_ACCOUNT = Pattern.compile("(?:\\d{1,6}-)?\\d{1,10}");
    private static final Pattern BANK_CODE = Pattern.compile("\\d{4}");

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

    public Transaction build() {
        return new Transaction(
                id,
                date,
                new Money(amount, Currency.getInstance(currency)),
                TransactionType.fromLabel(type),
                type,
                new Counterparty(account(), counterpartyName, null, null),
                new PaymentSymbols(variableSymbol, null, null),
                null, null, messageForRecipient, null, null, null, null,
                columns());
    }

    private BankAccount account() {
        if (counterpartyAccount == null) {
            return null;
        }
        if (DOMESTIC_ACCOUNT.matcher(counterpartyAccount).matches()
                && (counterpartyBankCode == null || BANK_CODE.matcher(counterpartyBankCode).matches())) {
            return DomesticAccount.parse(counterpartyBankCode == null ? counterpartyAccount : counterpartyAccount + "/" + counterpartyBankCode);
        }
        return new ForeignAccount(counterpartyAccount);
    }

    private Map<Integer, TransactionColumn> columns() {
        Map<Integer, TransactionColumn> columns = new TreeMap<>();
        put(columns, 0, "Datum", date.toString());
        put(columns, 1, "Objem", amount.toPlainString());
        put(columns, 2, "Protiúčet", counterpartyAccount);
        put(columns, 3, "Kód banky", counterpartyBankCode);
        put(columns, 5, "VS", variableSymbol);
        put(columns, 8, "Typ", type);
        put(columns, 10, "Název protiúčtu", counterpartyName);
        put(columns, 14, "Měna", currency);
        put(columns, 16, "Zpráva pro příjemce", messageForRecipient);
        put(columns, 22, "ID pohybu", Long.toString(id));
        return columns;
    }

    private static void put(Map<Integer, TransactionColumn> columns, int id, String name, String value) {
        if (value != null) {
            columns.put(id, new TransactionColumn(id, name, value));
        }
    }
}
