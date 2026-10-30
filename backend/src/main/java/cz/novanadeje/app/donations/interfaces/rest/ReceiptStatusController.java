package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.ReceiptStatusService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/donations/receipts/status")
class ReceiptStatusController {

    private final ReceiptStatusService statuses;
    private final ReceiptStatusRateLimiter rateLimiter;

    ReceiptStatusController(ReceiptStatusService statuses, ReceiptStatusRateLimiter rateLimiter) {
        this.statuses = statuses;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping
    ResponseEntity<ReceiptStatusResponse> status(@Valid @RequestBody ReceiptStatusRequest request, HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(statuses.statusOf(request.statusDigest()).map(ReceiptStatusResponse::of).orElse(ReceiptStatusResponse.UNKNOWN));
    }
}
