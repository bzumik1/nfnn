package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.CompanyLookupService;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/donors/company-lookup")
class CompanyLookupController {

    private static final int MAX_IDENTIFIER_LENGTH = 16;

    private final CompanyLookupService lookups;
    private final CompanyLookupRateLimiter rateLimiter;

    CompanyLookupController(CompanyLookupService lookups, CompanyLookupRateLimiter rateLimiter) {
        this.lookups = lookups;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping
    ResponseEntity<CompanyLookupResponse> lookUp(
            @RequestParam @NotBlank @Size(max = MAX_IDENTIFIER_LENGTH) @ValidCompanyIdentifier String companyIdentifier,
            HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        return lookups.lookUp(new CompanyIdentifier(companyIdentifier))
                .map(company -> ResponseEntity.ok(CompanyLookupResponse.of(company)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
