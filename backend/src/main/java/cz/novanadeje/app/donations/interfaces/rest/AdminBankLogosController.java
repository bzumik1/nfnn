package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.banklogo.BankLogoAdminRow;
import cz.novanadeje.app.donations.application.banklogo.BankLogoAdminService;
import cz.novanadeje.app.donations.application.banklogo.BankLogoPrecondition;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.shared.interfaces.rest.VersionRequiredException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpHeaders;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;
import java.util.UUID;

@RestController
@Validated
@RequestMapping("/api/admin/donations/bank-logos")
class AdminBankLogosController {

    private static final String SCOPE_CLAIM = "scope";
    private static final String CODE = "[0-9]{4}";
    private static final String ANY = "*";
    private static final char QUOTE = '"';

    private final BankLogoAdminService logos;
    private final BankLogoFetchRateLimiter fetchRateLimiter;

    AdminBankLogosController(BankLogoAdminService logos, BankLogoFetchRateLimiter fetchRateLimiter) {
        this.logos = logos;
        this.fetchRateLimiter = fetchRateLimiter;
    }

    @GetMapping
    AdminBankLogosResponse list() {
        return new AdminBankLogosResponse(logos.list());
    }

    @PutMapping("/{code}")
    BankLogoAdminRow setSource(@AuthenticationPrincipal Jwt jwt, @PathVariable @Pattern(regexp = CODE) String code,
                               @Valid @RequestBody BankLogoSourceRequest request,
                               @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
                               @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        BankLogoPrecondition precondition = precondition(jwt, ifMatch, ifNoneMatch);
        BankLogoSource source = new BankLogoSource(new BankCode(code), request.sourceUrl());
        fetchRateLimiter.check(jwt.getSubject());
        return logos.set(admin(jwt), source, precondition);
    }

    @PostMapping("/{code}/refresh")
    BankLogoAdminRow refresh(@AuthenticationPrincipal Jwt jwt, @PathVariable @Pattern(regexp = CODE) String code) {
        fetchRateLimiter.check(jwt.getSubject());
        return logos.refresh(admin(jwt), new BankCode(code));
    }

    @DeleteMapping("/{code}")
    ResponseEntity<Void> remove(@AuthenticationPrincipal Jwt jwt, @PathVariable @Pattern(regexp = CODE) String code, ExpectedVersion expected) {
        logos.remove(admin(jwt), new BankCode(code), expected);
        return ResponseEntity.noContent().build();
    }

    private static BankLogoPrecondition precondition(Jwt jwt, String ifMatch, String ifNoneMatch) {
        Optional<String> matching = present(ifMatch);
        if (matching.isPresent()) {
            return BankLogoPrecondition.matching(ExpectedVersion.of(version(matching.get())));
        }
        Optional<String> noneMatching = present(ifNoneMatch);
        if (noneMatching.isPresent()) {
            return ANY.equals(noneMatching.get()) ? BankLogoPrecondition.absent() : BankLogoPrecondition.matching(ExpectedVersion.of(ExpectedVersion.UNMATCHABLE));
        }
        if (jwt.hasClaim(SCOPE_CLAIM)) {
            return BankLogoPrecondition.anything();
        }
        throw new VersionRequiredException();
    }

    private static Optional<String> present(String header) {
        return Optional.ofNullable(header).map(String::strip).filter(value -> !value.isEmpty());
    }

    private static String version(String header) {
        boolean quoted = header.length() >= 2 && header.charAt(0) == QUOTE && header.charAt(header.length() - 1) == QUOTE;
        String value = quoted ? header.substring(1, header.length() - 1) : header;
        return value.isEmpty() || value.length() > ExpectedVersion.MAX_LENGTH ? ExpectedVersion.UNMATCHABLE : value;
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
