package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.PaymentDetailsService;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/donations/payment-details")
class PaymentDetailsController {

    static final String CACHE_CONTROL = "private, max-age=300";

    private final PaymentDetailsService paymentDetails;
    private final PaymentDetailsRateLimiter rateLimiter;
    private final JsonMapper json;

    PaymentDetailsController(PaymentDetailsService paymentDetails, PaymentDetailsRateLimiter rateLimiter, JsonMapper json) {
        this.paymentDetails = paymentDetails;
        this.rateLimiter = rateLimiter;
        this.json = json;
    }

    @GetMapping
    ResponseEntity<PaymentDetailsResponse> paymentDetails(HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        PaymentDetailsResponse body = PaymentDetailsResponse.from(paymentDetails.details());
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, CACHE_CONTROL)
                .eTag(ContentDigest.of(json.writeValueAsBytes(body)).value())
                .body(body);
    }
}
