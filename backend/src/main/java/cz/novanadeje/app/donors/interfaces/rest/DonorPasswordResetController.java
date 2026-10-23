package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorPasskeyRecoveryService;
import cz.novanadeje.app.donors.application.DonorPasswordResetService;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/donors/auth/password-reset")
class DonorPasswordResetController {

    private final DonorPasswordResetService passwordReset;
    private final DonorPasskeyRecoveryService passkeyRecovery;
    private final PasswordResetRateLimiter rateLimiter;
    private final SecondFactorRateLimiter codeLimiter;

    DonorPasswordResetController(DonorPasswordResetService passwordReset, DonorPasskeyRecoveryService passkeyRecovery,
                                 PasswordResetRateLimiter rateLimiter, SecondFactorRateLimiter codeLimiter) {
        this.passwordReset = passwordReset;
        this.passkeyRecovery = passkeyRecovery;
        this.rateLimiter = rateLimiter;
        this.codeLimiter = codeLimiter;
    }

    @PostMapping("/request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void request(@Valid @RequestBody PasswordResetRequest request, HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        passwordReset.requestReset(new EmailAddress(request.email()));
    }

    @PostMapping("/confirm")
    ResponseEntity<Void> confirm(@Valid @RequestBody PasswordResetConfirmation request) {
        passwordReset.confirmReset(request.token(), request.password());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, RefreshTokenCookie.cleared().toString())
                .build();
    }

    @PostMapping("/passkey/options")
    PasskeyCreationOptionsResponse passkeyOptions(@Valid @RequestBody PasskeyRecoveryOptionsRequest request, HttpServletRequest http) {
        codeLimiter.check(http.getRemoteAddr());
        return PasskeyCreationOptionsResponse.of(passkeyRecovery.options(request.token(), request.code()));
    }

    @PostMapping("/passkey")
    @ResponseStatus(HttpStatus.CREATED)
    PasskeyResponse recoverWithPasskey(@Valid @RequestBody PasskeyRecoveryRequest request) {
        return PasskeyResponse.of(passkeyRecovery.recover(request.token(), request.challenge(), request.name(), request.attestation()));
    }
}
