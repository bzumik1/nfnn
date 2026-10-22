package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.Instant;
import java.util.regex.Pattern;

public final class SymbolClaim {

    private static final Pattern MATCHING_SYMBOL = Pattern.compile("[1-9][0-9]{0," + (VariableSymbol.MAX_LENGTH - 1) + "}");

    private final SymbolClaimId id;
    private final DonorReference donor;
    private final SenderAccount account;
    private final VariableSymbol symbol;
    private final SymbolClaimAnswer answer;
    private final Instant answeredAt;

    private SymbolClaim(SymbolClaimId id, DonorReference donor, SenderAccount account, VariableSymbol symbol, SymbolClaimAnswer answer,
                        Instant answeredAt) {
        this.id = require(id, "Symbol claim id");
        this.donor = require(donor, "Donor reference");
        this.account = require(account, "Sender account");
        this.symbol = requireMatchingForm(symbol);
        this.answer = require(answer, "Answer");
        this.answeredAt = require(answeredAt, "Answer time");
    }

    public static SymbolClaim answer(SymbolClaimId id, DonorReference donor, SenderAccount account, VariableSymbol symbol,
                                     SymbolClaimAnswer answer, Instant at) {
        return new SymbolClaim(id, donor, account, symbol, answer, at);
    }

    public static SymbolClaim reconstitute(SymbolClaimId id, DonorReference donor, SenderAccount account, VariableSymbol symbol,
                                           SymbolClaimAnswer answer, Instant answeredAt) {
        return new SymbolClaim(id, donor, account, symbol, answer, answeredAt);
    }

    public SymbolClaim reverse(Instant at) {
        if (!isConfirmed()) {
            throw new SymbolClaimNotConfirmed(id);
        }
        return new SymbolClaim(id, donor, account, symbol, SymbolClaimAnswer.DECLINED, at);
    }

    public boolean confirms(BankPayment payment) {
        return isConfirmed()
                && require(payment, "Payment").sender().filter(account::equals).isPresent()
                && payment.matchingVariableSymbol().filter(symbol::equals).isPresent();
    }

    public boolean answers(SenderAccount account, VariableSymbol symbol) {
        return this.account.equals(account) && this.symbol.equals(symbol);
    }

    public boolean isConfirmed() {
        return answer == SymbolClaimAnswer.CONFIRMED;
    }

    public SymbolClaimId id() {
        return id;
    }

    public DonorReference donor() {
        return donor;
    }

    public SenderAccount account() {
        return account;
    }

    public VariableSymbol symbol() {
        return symbol;
    }

    public SymbolClaimAnswer answer() {
        return answer;
    }

    public Instant answeredAt() {
        return answeredAt;
    }

    private static VariableSymbol requireMatchingForm(VariableSymbol symbol) {
        if (!MATCHING_SYMBOL.matcher(require(symbol, "Variable symbol").value()).matches()) {
            throw new IllegalArgumentException("A claimed variable symbol is one to ten digits without a leading zero");
        }
        return symbol;
    }

    private static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }
}
