package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorSecondFactorService;
import cz.novanadeje.app.donors.domain.DonorId;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;

@RestController
@RequestMapping("/api/donors/me/second-factor")
class DonorSecondFactorController {

    private final DonorSecondFactorService secondFactors;
    private final SecondFactorChangeRateLimiter limiter;
    private final Clock clock;

    DonorSecondFactorController(DonorSecondFactorService secondFactors, SecondFactorChangeRateLimiter limiter, Clock clock) {
        this.secondFactors = secondFactors;
        this.limiter = limiter;
        this.clock = clock;
    }

    @PostMapping("/setup")
    SecondFactorEnrolmentResponse setup(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SecondFactorSetupRequest request,
                                        HttpServletRequest http) {
        limiter.check(http.getRemoteAddr());
        return SecondFactorEnrolmentResponse.of(secondFactors.begin(DonorId.of(jwt.getSubject()), SessionRoles.secondFactorVerified(jwt), request.password()));
    }

    @PostMapping("/confirm")
    ResponseEntity<AuthResponse> confirm(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SecondFactorCodeRequest request,
                                         HttpServletRequest http) {
        limiter.check(http.getRemoteAddr());
        return SessionResponses.opened(HttpStatus.OK, secondFactors.confirm(DonorId.of(jwt.getSubject()), request.code()), clock.instant());
    }

    @PostMapping("/disable")
    ResponseEntity<AuthResponse> disable(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SecondFactorDisableRequest request,
                                         HttpServletRequest http) {
        limiter.check(http.getRemoteAddr());
        return SessionResponses.opened(HttpStatus.OK,
                secondFactors.disable(DonorId.of(jwt.getSubject()), request.password(), request.code()), clock.instant());
    }
}
