package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.admin.AdminSymbolClaimsService;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/donations/symbol-claims")
class AdminSymbolClaimsController {

    private final AdminSymbolClaimsService symbolClaims;

    AdminSymbolClaimsController(AdminSymbolClaimsService symbolClaims) {
        this.symbolClaims = symbolClaims;
    }

    @GetMapping
    AdminSymbolClaimListResponse list() {
        return AdminSymbolClaimListResponse.from(symbolClaims.list());
    }

    @PostMapping("/{id}/reverse")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void reverse(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        symbolClaims.reverse(UUID.fromString(jwt.getSubject()), new SymbolClaimId(id));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void reset(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        symbolClaims.reset(UUID.fromString(jwt.getSubject()), new SymbolClaimId(id));
    }
}
