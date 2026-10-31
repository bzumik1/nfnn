package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeyWithdrawal;
import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeys;
import cz.novanadeje.app.donations.application.signing.WithdrawnReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.interfaces.rest.FreshSecondFactorRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/donations/receipt-signing-keys")
class AdminReceiptSigningKeysController {

    private static final String KEY_ID_SHAPE = "^[0-9a-f]{8}$";

    private final ReceiptSigningKeys keys;
    private final ReceiptSigningKeyWithdrawal withdrawal;
    private final ReceiptSigningKeyWithdrawalRateLimiter rateLimiter;

    AdminReceiptSigningKeysController(ReceiptSigningKeys keys, ReceiptSigningKeyWithdrawal withdrawal, ReceiptSigningKeyWithdrawalRateLimiter rateLimiter) {
        this.keys = keys;
        this.withdrawal = withdrawal;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping
    AdminReceiptSigningKeysResponse overview() {
        return AdminReceiptSigningKeysResponse.of(keys.overview());
    }

    @PostMapping("/{keyId}/withdrawal")
    ReceiptSigningKeyWithdrawalResponse withdraw(@AuthenticationPrincipal Jwt jwt, @PathVariable @Pattern(regexp = KEY_ID_SHAPE) String keyId,
                                                 @Valid @RequestBody FreshSecondFactorRequest request, HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        WithdrawnReceiptSigningKey withdrawn = withdrawal.withdraw(UUID.fromString(jwt.getSubject()), new ReceiptSigningKeyId(keyId), request.toProof());
        return ReceiptSigningKeyWithdrawalResponse.of(withdrawn.current(), keys.overview());
    }
}
