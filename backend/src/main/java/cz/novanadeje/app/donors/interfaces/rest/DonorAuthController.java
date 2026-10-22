package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AuthenticatedDonor;
import cz.novanadeje.app.donors.application.DonorAuthenticationService;
import cz.novanadeje.app.donors.application.DonorRegistrationService;
import cz.novanadeje.app.donors.domain.InvalidRefreshToken;
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

import java.time.Clock;

@RestController
@RequestMapping("/api/donors/auth")
class DonorAuthController {

    private final DonorRegistrationService registration;
    private final DonorAuthenticationService authentication;
    private final SignInRateLimiter signInRateLimiter;
    private final SecondFactorRateLimiter secondFactorRateLimiter;
    private final RegistrationRateLimiter registrationRateLimiter;
    private final Clock clock;

    DonorAuthController(DonorRegistrationService registration, DonorAuthenticationService authentication,
                        SignInRateLimiter signInRateLimiter, SecondFactorRateLimiter secondFactorRateLimiter,
                        RegistrationRateLimiter registrationRateLimiter, Clock clock) {
        this.registration = registration;
        this.authentication = authentication;
        this.signInRateLimiter = signInRateLimiter;
        this.secondFactorRateLimiter = secondFactorRateLimiter;
        this.registrationRateLimiter = registrationRateLimiter;
        this.clock = clock;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void register(@Valid @RequestBody RegisterDonorRequest request, HttpServletRequest http) {
        registrationRateLimiter.check(http.getRemoteAddr());
        registration.register(request.toCommand());
    }

    @PostMapping("/login")
    ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        signInRateLimiter.check(http.getRemoteAddr());
        return respondWithSession(HttpStatus.OK, authentication.login(request.email(), request.password()));
    }

    @PostMapping("/login/second-factor")
    ResponseEntity<AuthResponse> completeSecondFactor(@Valid @RequestBody SecondFactorLoginRequest request, HttpServletRequest http) {
        secondFactorRateLimiter.check(http.getRemoteAddr());
        return respondWithSession(HttpStatus.OK, authentication.completeSecondFactor(request.challenge(), request.code()));
    }

    @PostMapping("/refresh")
    ResponseEntity<AuthResponse> refresh(HttpServletRequest http) {
        String presented = RefreshTokenCookie.read(http).orElseThrow(InvalidRefreshToken::new);
        return respondWithSession(HttpStatus.OK, authentication.refresh(presented));
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest http) {
        RefreshTokenCookie.read(http).ifPresent(authentication::logout);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, RefreshTokenCookie.cleared().toString())
                .build();
    }

    private ResponseEntity<AuthResponse> respondWithSession(HttpStatus status, AuthenticatedDonor authenticated) {
        return SessionResponses.opened(status, authenticated, clock.instant());
    }
}
