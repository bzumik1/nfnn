package cz.novanadeje.app.donations.infrastructure.recovery;

import cz.novanadeje.app.donations.application.GeneratePaymentQrService;
import cz.novanadeje.app.donations.application.PaymentQr;
import cz.novanadeje.app.donations.application.recovery.SecondFactorRecoveryPayments;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryPaymentQr;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryTarget;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryTargets;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
class SecondFactorRecoveryTargetsAdapter implements SecondFactorRecoveryTargets {

    private final SecondFactorRecoveryPayments recoveries;
    private final GeneratePaymentQrService paymentQr;

    SecondFactorRecoveryTargetsAdapter(SecondFactorRecoveryPayments recoveries, GeneratePaymentQrService paymentQr) {
        this.recoveries = recoveries;
        this.paymentQr = paymentQr;
    }

    @Override
    public Optional<SecondFactorRecoveryTarget> targetFor(UUID donorId) {
        return recoveries.targetFor(new DonorReference(donorId));
    }

    @Override
    public SecondFactorRecoveryPaymentQr paymentQrFor(SecondFactorRecoveryCode code) {
        PaymentQr qr = paymentQr.generateForRecovery(code);
        return new SecondFactorRecoveryPaymentQr(qr.spayd(), qr.modules());
    }
}
