package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorCredentialsService;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;

@RestController
@RequestMapping("/api/donors/me")
class DonorCredentialsController {

    private final DonorCredentialsService credentials;
    private final PasswordChangeRateLimiter passwordLimiter;
    private final EmailChangeRateLimiter emailLimiter;
    private final Clock clock;

    DonorCredentialsController(DonorCredentialsService credentials, PasswordChangeRateLimiter passwordLimiter,
                               EmailChangeRateLimiter emailLimiter, Clock clock) {
        this.credentials = credentials;
        this.passwordLimiter = passwordLimiter;
        this.emailLimiter = emailLimiter;
        this.clock = clock;
    }

    @PutMapping("/password")
    ResponseEntity<AuthResponse> changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ChangePasswordRequest request,
                                                HttpServletRequest http) {
        passwordLimiter.check(http.getRemoteAddr());
        return SessionResponses.opened(HttpStatus.OK,
                credentials.changePassword(DonorId.of(jwt.getSubject()), request.currentPassword(), request.newPassword()), clock.instant());
    }

    @PostMapping("/email-change")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void requestEmailChange(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody EmailChangeRequest request, HttpServletRequest http) {
        emailLimiter.check(http.getRemoteAddr());
        credentials.requestEmailChange(DonorId.of(jwt.getSubject()), request.password(), new EmailAddress(request.newEmail()));
    }
}
