package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdministratorActivityService;
import cz.novanadeje.app.donors.application.AdministratorService;
import cz.novanadeje.app.donors.application.DonorAdministrationService;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/donors")
class AdminDonorsController {

    static final int MAX_QUERY_LENGTH = 254;

    private final AdministratorService administrators;
    private final AdministratorActivityService activity;
    private final DonorAdministrationService donors;

    AdminDonorsController(AdministratorService administrators, AdministratorActivityService activity, DonorAdministrationService donors) {
        this.administrators = administrators;
        this.activity = activity;
        this.donors = donors;
    }

    @GetMapping
    DonorAccountListResponse search(@RequestParam(defaultValue = "") @Size(max = MAX_QUERY_LENGTH) String query) {
        return DonorAccountListResponse.from(donors.search(query));
    }

    @GetMapping("/{donorId}")
    DonorAccountResponse donor(@PathVariable UUID donorId) {
        return DonorAccountResponse.from(donors.view(new DonorId(donorId)));
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

    @GetMapping("/actions")
    AdminActionListResponse actions(
            @RequestParam(required = false) Instant before,
            @RequestParam(defaultValue = "" + AdministratorActivityService.DEFAULT_PAGE_SIZE)
            @Min(1) @Max(AdministratorActivityService.MAX_PAGE_SIZE) int limit
    ) {
        return AdminActionListResponse.from(activity.list(Optional.ofNullable(before), limit));
    }

    private static DonorId admin(Jwt jwt) {
        return DonorId.of(jwt.getSubject());
    }
}
