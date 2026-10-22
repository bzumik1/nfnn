package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdministratorService;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.domain.EmailAddress;
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
@RequestMapping("/api/admin/donors")
class AdminDonorsController {

    private final AdministratorService administrators;

    AdminDonorsController(AdministratorService administrators) {
        this.administrators = administrators;
    }

    @GetMapping("/administrators")
    AdministratorListResponse list() {
        return AdministratorListResponse.from(administrators.list());
    }

    @PostMapping("/administrators")
    @ResponseStatus(HttpStatus.CREATED)
    AdministratorResponse grant(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody GrantAdministrationRequest request) {
        return AdministratorResponse.from(administrators.grant(admin(jwt), new EmailAddress(request.email())));
    }

    @DeleteMapping("/administrators/{donorId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID donorId) {
        administrators.revoke(admin(jwt), new DonorId(donorId));
    }

    @PostMapping("/{donorId}/second-factor/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void resetSecondFactor(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID donorId) {
        administrators.resetSecondFactor(admin(jwt), new DonorId(donorId));
    }

    private static DonorId admin(Jwt jwt) {
        return DonorId.of(jwt.getSubject());
    }
}
