package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorEmailVerificationService;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;

@RestController
@RequestMapping("/api/donors/auth/email-verification")
class DonorEmailVerificationController {

    private final DonorEmailVerificationService emailVerification;
    private final EmailVerificationRateLimiter rateLimiter;
    private final Clock clock;

    DonorEmailVerificationController(DonorEmailVerificationService emailVerification, EmailVerificationRateLimiter rateLimiter, Clock clock) {
        this.emailVerification = emailVerification;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
    }

    @PostMapping("/request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void request(@Valid @RequestBody EmailVerificationRequest request, HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        emailVerification.requestVerification(new EmailAddress(request.email()));
    }

    @PostMapping("/confirm")
    ResponseEntity<AuthResponse> confirm(@Valid @RequestBody EmailVerificationConfirmation request) {
        return SessionResponses.opened(HttpStatus.OK, emailVerification.confirm(request.token()), clock.instant());
    }
}
