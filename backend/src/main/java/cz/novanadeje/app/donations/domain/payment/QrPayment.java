package cz.novanadeje.app.donations.domain.payment;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.StringJoiner;

public final class QrPayment {

    private static final String HEADER = "SPD*1.0";
    private static final String FIELD_SEPARATOR = "*";
    private static final long MAX_AMOUNT_MINOR = 999_999_999L;
    private static final int MAX_RECIPIENT_NAME_LENGTH = 35;
    private static final int MAX_MESSAGE_LENGTH = 60;

    private final BankAccount recipient;
    private final Money amount;
    private final VariableSymbol variableSymbol;
    private final String message;

    private QrPayment(BankAccount recipient, Money amount, VariableSymbol variableSymbol, String message) {
        if (recipient == null) {
            throw new IllegalArgumentException("Recipient account is required");
        }
        if (amount == null || !amount.isPositive()) {
            throw new IllegalArgumentException("Donation amount must be positive: " + amount);
        }
        if (amount.amountMinor() > MAX_AMOUNT_MINOR) {
            throw new IllegalArgumentException("Donation amount does not fit a QR payment: " + amount);
        }
        this.recipient = recipient;
        this.amount = amount;
        this.variableSymbol = variableSymbol;
        this.message = message;
    }

    public static QrPayment donation(BankAccount recipient, Money amount) {
        return new QrPayment(recipient, amount, null, QrPaymentPurpose.DONATION.message());
    }

    public static QrPayment donation(BankAccount recipient, Money amount, VariableSymbol variableSymbol) {
        if (variableSymbol == null) {
            throw new IllegalArgumentException("Variable symbol is required for an identified donation");
        }
        return new QrPayment(recipient, amount, variableSymbol, QrPaymentPurpose.DONATION.message());
    }

    public static QrPayment accountVerification(BankAccount recipient, Money amount, VariableSymbol variableSymbol) {
        if (variableSymbol == null) {
            throw new VerificationNeedsVariableSymbol();
        }
        return new QrPayment(recipient, amount, variableSymbol, QrPaymentPurpose.ACCOUNT_VERIFICATION.message());
    }

    public static QrPayment secondFactorRecovery(BankAccount recipient, Money amount, SecondFactorRecoveryCode code) {
        if (code == null) {
            throw new IllegalArgumentException("A recovery code is required for a second-factor recovery payment");
        }
        return new QrPayment(recipient, amount, null, code.message());
    }

    public BankAccount recipient() {
        return recipient;
    }

    public Money amount() {
        return amount;
    }

    public Optional<VariableSymbol> variableSymbol() {
        return Optional.ofNullable(variableSymbol);
    }

    public String message() {
        return message;
    }

    public String toSpayd() {
        StringJoiner spayd = new StringJoiner(FIELD_SEPARATOR).add(HEADER)
                .add("ACC:" + recipient.iban().value())
                .add("AM:" + amount.toDecimal().toPlainString())
                .add("CC:" + amount.currency().name());
        variableSymbol().ifPresent(symbol -> spayd.add("X-VS:" + symbol.value()));
        addText(spayd, "RN:", recipient.recipientName(), MAX_RECIPIENT_NAME_LENGTH);
        addText(spayd, "MSG:", message, MAX_MESSAGE_LENGTH);
        return spayd.toString();
    }

    private static void addText(StringJoiner spayd, String key, String text, int maxLength) {
        String value = spaydText(text, maxLength);
        if (!value.isEmpty()) {
            spayd.add(key + value);
        }
    }

    private static String spaydText(String text, int maxLength) {
        String plain = Normalizer.normalize(text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^0-9A-Z $%+\\-./:]", " ")
                .replaceAll(" {2,}", " ")
                .trim();
        return plain.length() <= maxLength ? plain : plain.substring(0, maxLength).trim();
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof QrPayment payment
                && recipient.equals(payment.recipient)
                && amount.equals(payment.amount)
                && Objects.equals(variableSymbol, payment.variableSymbol)
                && message.equals(payment.message);
    }

    @Override
    public int hashCode() {
        return Objects.hash(recipient, amount, variableSymbol, message);
    }

    @Override
    public String toString() {
        return "QrPayment[amount=" + amount + ", variableSymbol=" + variableSymbol().map(VariableSymbol::value).orElse("none") + ", message=***]";
    }
}
