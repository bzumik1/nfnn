package cz.novanadeje.app.donations.application;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.payment.QrPayment;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class GeneratePaymentQrService {

    public static final int QR_SIZE_PX = 300;

    private final BankAccount foundationAccount;
    private final QrCodeRenderer renderer;

    public GeneratePaymentQrService(BankAccount foundationAccount, QrCodeRenderer renderer) {
        this.foundationAccount = foundationAccount;
        this.renderer = renderer;
    }

    public PaymentQr generate(GeneratePaymentQrQuery query) {
        QrPayment payment = donation(Money.of(BigDecimal.valueOf(query.amountCzk()), Currency.CZK), query.variableSymbol());
        String spayd = payment.toSpayd();
        return new PaymentQr(spayd, renderer.renderPng(spayd, QR_SIZE_PX), foundationAccount);
    }

    private QrPayment donation(Money amount, String variableSymbol) {
        if (variableSymbol == null) {
            return QrPayment.donation(foundationAccount, amount);
        }
        return QrPayment.donation(foundationAccount, amount, new VariableSymbol(variableSymbol));
    }
}
