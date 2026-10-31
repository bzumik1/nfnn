package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.PaymentDetailsService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@RestController
@RequestMapping("/api/donations/payment-details")
class PaymentDetailsController {

    static final String CACHE_CONTROL = "private, max-age=300";

    private final PaymentDetailsRateLimiter rateLimiter;
    private final PaymentDetailsResponse body;
    private final String etag;

    PaymentDetailsController(PaymentDetailsService paymentDetails, PaymentDetailsRateLimiter rateLimiter, JsonMapper json) {
        this.rateLimiter = rateLimiter;
        this.body = PaymentDetailsResponse.from(paymentDetails.details());
        this.etag = sha256Hex(json.writeValueAsBytes(body));
    }

    @GetMapping
    ResponseEntity<PaymentDetailsResponse> paymentDetails(HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, CACHE_CONTROL)
                .eTag(etag)
                .body(body);
    }

    private static String sha256Hex(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }
}
