package cz.novanadeje.app.donations.application;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.shared.domain.Iban;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
    private static final byte[] PNG = {1, 2, 3};

    @Mock
    private QrCodeRenderer renderer;

    private GeneratePaymentQrService service;

    @BeforeEach
    void setUp() {
        service = new GeneratePaymentQrService(FOUNDATION, renderer);
    }

    @Test
    void should_render_the_spayd_of_a_donation_in_whole_crowns_when_generated_given_a_variable_symbol() {
        when(renderer.renderPng(anyString(), anyInt())).thenReturn(PNG);

        PaymentQr qr = service.generate(new GeneratePaymentQrQuery(500, "1234567890"));

        String expected = "SPD*1.0*ACC:CZ6508000000192000145399*AM:500.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NOVA NADEJE";
        assertThat(qr.spayd()).isEqualTo(expected);
        assertThat(qr.pngImage()).isEqualTo(PNG);
        assertThat(qr.recipient()).isEqualTo(FOUNDATION);
        verify(renderer).renderPng(eq(expected), eq(GeneratePaymentQrService.QR_SIZE_PX));
    }

    @Test
    void should_render_a_spayd_without_variable_symbol_when_generated_given_none() {
        when(renderer.renderPng(anyString(), anyInt())).thenReturn(PNG);

        PaymentQr qr = service.generate(new GeneratePaymentQrQuery(100, null));

        assertThat(qr.spayd()).contains("*AM:100.00*").doesNotContain("X-VS:");
    }

    @Test
    void should_reject_without_rendering_when_generated_given_a_malformed_variable_symbol() {
        assertThatIllegalArgumentException().isThrownBy(() -> service.generate(new GeneratePaymentQrQuery(100, "12A")));
        verifyNoInteractions(renderer);
    }
}
