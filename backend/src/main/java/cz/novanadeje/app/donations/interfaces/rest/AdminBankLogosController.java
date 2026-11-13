package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.banklogo.BankLogoAdminService;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.shared.application.version.WritePrecondition;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@Validated
@RequestMapping("/api/admin/donations/bank-logos")
class AdminBankLogosController {

    private static final String CODE = "[0-9]{4}";

    private final BankLogoAdminService logos;
    private final BankLogoFetchRateLimiter fetchRateLimiter;

    AdminBankLogosController(BankLogoAdminService logos, BankLogoFetchRateLimiter fetchRateLimiter) {
        this.logos = logos;
        this.fetchRateLimiter = fetchRateLimiter;
    }

    @GetMapping
    AdminBankLogosResponse list() {
        return AdminBankLogosResponse.from(logos.list());
    }

    @PutMapping("/{code}")
    AdminBankLogoResponse setSource(@AuthenticationPrincipal Jwt jwt, @PathVariable @Pattern(regexp = CODE) String code,
                                    @Valid @RequestBody BankLogoSourceRequest request, WritePrecondition precondition) {
        BankLogoSource source = new BankLogoSource(new BankCode(code), request.sourceUrl());
        fetchRateLimiter.check(jwt.getSubject());
        return AdminBankLogoResponse.from(logos.set(admin(jwt), source, precondition));
    }

    @PostMapping("/{code}/refresh")
    AdminBankLogoResponse refresh(@AuthenticationPrincipal Jwt jwt, @PathVariable @Pattern(regexp = CODE) String code) {
        fetchRateLimiter.check(jwt.getSubject());
        return AdminBankLogoResponse.from(logos.refresh(admin(jwt), new BankCode(code)));
    }

    @DeleteMapping("/{code}")
    ResponseEntity<Void> remove(@AuthenticationPrincipal Jwt jwt, @PathVariable @Pattern(regexp = CODE) String code, ExpectedVersion expected) {
        logos.remove(admin(jwt), new BankCode(code), expected);
        return ResponseEntity.noContent().build();
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
