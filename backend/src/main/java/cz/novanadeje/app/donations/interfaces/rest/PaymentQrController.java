package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.GeneratePaymentQrQuery;
import cz.novanadeje.app.donations.application.GeneratePaymentQrService;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/donations/payment-qr")
class PaymentQrController {

    static final long MIN_AMOUNT_CZK = 1;
    static final long MAX_AMOUNT_CZK = 1_000_000;

    private final GeneratePaymentQrService generatePaymentQr;

    PaymentQrController(GeneratePaymentQrService generatePaymentQr) {
        this.generatePaymentQr = generatePaymentQr;
    }

    @GetMapping
    PaymentQrResponse paymentQr(
            @RequestParam @Min(MIN_AMOUNT_CZK) @Max(MAX_AMOUNT_CZK) long amount,
            @RequestParam(required = false) @Pattern(regexp = VariableSymbol.FORMAT) String variableSymbol
    ) {
        return PaymentQrResponse.from(generatePaymentQr.generate(new GeneratePaymentQrQuery(amount, variableSymbol)));
    }
}
