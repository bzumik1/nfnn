package cz.novanadeje.app.donations.application;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.shared.application.qr.QrCodeEncoder;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import cz.novanadeje.app.donations.domain.payment.QrPayment;
import cz.novanadeje.app.donations.domain.payment.QrPaymentPurpose;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class GeneratePaymentQrService {

    private final BankAccount foundationAccount;
    private final QrCodeEncoder encoder;

    public GeneratePaymentQrService(BankAccount foundationAccount, QrCodeEncoder encoder) {
        this.foundationAccount = foundationAccount;
        this.encoder = encoder;
    }

    public PaymentQr generate(GeneratePaymentQrQuery query) {
        QrPayment payment = payment(Money.of(BigDecimal.valueOf(query.amountCzk()), Currency.CZK), query.variableSymbol(), query.purpose());
        String spayd = payment.toSpayd();
        return new PaymentQr(spayd, encoder.encode(spayd, QrErrorCorrection.HIGH), foundationAccount);
    }

    private QrPayment payment(Money amount, String variableSymbol, QrPaymentPurpose purpose) {
        VariableSymbol symbol = variableSymbol == null ? null : new VariableSymbol(variableSymbol);
        return switch (purpose) {
            case ACCOUNT_VERIFICATION -> QrPayment.accountVerification(foundationAccount, amount, symbol);
            case DONATION -> symbol == null ? QrPayment.donation(foundationAccount, amount) : QrPayment.donation(foundationAccount, amount, symbol);
        };
    }
}
