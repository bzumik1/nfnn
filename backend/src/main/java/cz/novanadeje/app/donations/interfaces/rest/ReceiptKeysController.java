package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeys;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
@RequestMapping("/api/donations/receipt-keys")
class ReceiptKeysController {

    private static final String AN_HOUR_FOR_EVERYONE = "public, max-age=" + Duration.ofHours(1).toSeconds();

    private final ReceiptSigningKeys keys;
    private final FoundationIdentity foundation;
    private final ReceiptKeysRateLimiter rateLimiter;

    ReceiptKeysController(ReceiptSigningKeys keys, FoundationIdentity foundation, ReceiptKeysRateLimiter rateLimiter) {
        this.keys = keys;
        this.foundation = foundation;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping
    ResponseEntity<ReceiptKeysResponse> list(HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        ReceiptKeysResponse response = ReceiptKeysResponse.of(foundation, keys.published());
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, AN_HOUR_FOR_EVERYONE).eTag(response.entityTag()).body(response);
    }
}
