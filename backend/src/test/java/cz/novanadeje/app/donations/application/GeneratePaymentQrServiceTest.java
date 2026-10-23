package cz.novanadeje.app.donations.application;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.shared.application.qr.QrCodeEncoder;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import cz.novanadeje.app.shared.application.qr.QrMatrix;
import cz.novanadeje.app.donations.domain.payment.QrPaymentPurpose;
import cz.novanadeje.app.donations.domain.payment.VerificationNeedsVariableSymbol;
import cz.novanadeje.app.shared.domain.Iban;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GeneratePaymentQrServiceTest {

    private static final BankAccount FOUNDATION = new BankAccount(
            "123456789/0800",
            new Iban("CZ6508000000192000145399"),
            "Nadační fond Nová naděje"
    );
    private static final QrMatrix MODULES = new QrMatrix(21, "0".repeat(21 * 21));

    @Mock
    private QrCodeEncoder encoder;

    private GeneratePaymentQrService service;

    @BeforeEach
    void setUp() {
        service = new GeneratePaymentQrService(FOUNDATION, encoder);
    }

    @Test
    @DisplayName("Given a variable symbol, when the QR code is generated, then it encodes the SPAYD of a donation in whole crowns")
    void should_encode_the_spayd_of_a_donation_in_whole_crowns_when_generated_given_a_variable_symbol() {
        when(encoder.encode(anyString(), any())).thenReturn(MODULES);

        PaymentQr qr = service.generate(new GeneratePaymentQrQuery(500, "1234567890", QrPaymentPurpose.DONATION));

        String expected = "SPD*1.0*ACC:CZ6508000000192000145399*AM:500.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NADACNI FOND NOVA NADEJE";
        assertThat(qr.spayd()).isEqualTo(expected);
        assertThat(qr.modules()).isEqualTo(MODULES);
        assertThat(qr.recipient()).isEqualTo(FOUNDATION);
        verify(encoder).encode(expected, QrErrorCorrection.HIGH);
    }

    @Test
    @DisplayName("Given no variable symbol, when the QR code is generated, then the SPAYD has none")
    void should_render_a_spayd_without_variable_symbol_when_generated_given_none() {
        when(encoder.encode(anyString(), any())).thenReturn(MODULES);

        PaymentQr qr = service.generate(new GeneratePaymentQrQuery(100, null, QrPaymentPurpose.DONATION));

        assertThat(qr.spayd()).contains("*AM:100.00*").doesNotContain("X-VS:");
    }

    @Test
    @DisplayName("Given an account verification, when the QR code is generated, then it carries the verification message")
    void should_render_the_verification_message_when_generated_given_account_verification() {
        when(encoder.encode(anyString(), any())).thenReturn(MODULES);

        PaymentQr qr = service.generate(new GeneratePaymentQrQuery(1, "1234567890", QrPaymentPurpose.ACCOUNT_VERIFICATION));

        assertThat(qr.spayd()).contains("*AM:1.00*").contains("*X-VS:1234567890*").endsWith("*MSG:OVERENI UCTU NADACNI FOND NOVA NADEJE");
    }

    @Test
    @DisplayName("Given an account verification without a variable symbol, when the QR code is generated, then it is rejected before rendering")
    void should_reject_without_rendering_when_generated_given_account_verification_without_variable_symbol() {
        assertThatThrownBy(() -> service.generate(new GeneratePaymentQrQuery(1, null, QrPaymentPurpose.ACCOUNT_VERIFICATION)))
                .isInstanceOf(VerificationNeedsVariableSymbol.class);
        verifyNoInteractions(encoder);
    }

    @Test
    @DisplayName("Given a malformed variable symbol, when the QR code is generated, then it is rejected before rendering")
    void should_reject_without_rendering_when_generated_given_a_malformed_variable_symbol() {
        assertThatIllegalArgumentException().isThrownBy(() -> service.generate(new GeneratePaymentQrQuery(100, "12A", QrPaymentPurpose.DONATION)));
        verifyNoInteractions(encoder);
    }
}
