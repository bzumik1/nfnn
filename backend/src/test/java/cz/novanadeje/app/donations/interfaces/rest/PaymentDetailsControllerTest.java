package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.PaymentDetailsService;
import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.payment.PaymentDetails;
import cz.novanadeje.app.shared.domain.Iban;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import tools.jackson.databind.json.JsonMapper;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PaymentDetailsControllerTest {

    private static final BankAccount FOUNDATION = new BankAccount("5544332217/2010", new Iban("CZ2620100000005544332217"), "Nadační fond Nová naděje");

    private final JsonMapper json = JsonMapper.builder().build();
    private final PaymentDetailsService service = mock(PaymentDetailsService.class);
    private final PaymentDetailsRateLimiter limiter = new PaymentDetailsRateLimiter(
            new MutableClock(Instant.parse("2026-10-30T10:00:00Z"), ZoneId.of("Europe/Prague")));

    @Test
    @DisplayName("Given the payment details controller, when it answers two requests, then it read the details and computed the ETag once, as the SHA-256 of the body it sends")
    void should_compute_the_body_and_its_etag_once_when_answering_two_requests() {
        when(service.details()).thenReturn(PaymentDetails.of(FOUNDATION));
        PaymentDetailsController controller = new PaymentDetailsController(service, limiter, json);

        ResponseEntity<PaymentDetailsResponse> first = controller.paymentDetails(new MockHttpServletRequest());
        ResponseEntity<PaymentDetailsResponse> second = controller.paymentDetails(new MockHttpServletRequest());

        verify(service, times(1)).details();
        assertThat(second.getBody()).isSameAs(first.getBody());
        assertThat(first.getHeaders().getETag()).isEqualTo("\"" + sha256(json.writeValueAsBytes(first.getBody())) + "\"");
        assertThat(second.getHeaders().getETag()).isEqualTo(first.getHeaders().getETag());
    }

    private static String sha256(byte[] body) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }
}
