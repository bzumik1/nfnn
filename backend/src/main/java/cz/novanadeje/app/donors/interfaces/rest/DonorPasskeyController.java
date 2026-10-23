package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorPasskeyService;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasskeyId;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/donors/me/passkeys")
class DonorPasskeyController {

    private final DonorPasskeyService passkeys;
    private final PasskeyChangeRateLimiter limiter;

    DonorPasskeyController(DonorPasskeyService passkeys, PasskeyChangeRateLimiter limiter) {
        this.passkeys = passkeys;
        this.limiter = limiter;
    }

    @PostMapping("/options")
    PasskeyCreationOptionsResponse options(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasskeyOptionsRequest request,
                                           HttpServletRequest http) {
        limiter.check(http.getRemoteAddr());
        return PasskeyCreationOptionsResponse.of(passkeys.creationOptions(DonorId.of(jwt.getSubject()), SessionRoles.secondFactorVerified(jwt), request.password()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    PasskeyResponse register(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasskeyRegistrationRequest request) {
        return PasskeyResponse.of(passkeys.register(DonorId.of(jwt.getSubject()), request.challenge(), request.name(), request.attestation()));
    }

    @GetMapping
    PasskeyListResponse list(@AuthenticationPrincipal Jwt jwt) {
        return PasskeyListResponse.from(passkeys.list(DonorId.of(jwt.getSubject())));
    }

    @DeleteMapping("/{passkeyId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID passkeyId) {
        passkeys.remove(DonorId.of(jwt.getSubject()), SessionRoles.secondFactorVerified(jwt), new PasskeyId(passkeyId));
    }
}
