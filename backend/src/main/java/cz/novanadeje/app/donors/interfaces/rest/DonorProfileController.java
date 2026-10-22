package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorProfileService;
import cz.novanadeje.app.donors.domain.DonorId;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/donors/me")
class DonorProfileController {

    private final DonorProfileService profiles;

    DonorProfileController(DonorProfileService profiles) {
        this.profiles = profiles;
    }

    @GetMapping
    DonorResponse profile(@AuthenticationPrincipal Jwt jwt) {
        return DonorResponse.of(profiles.profile(DonorId.of(jwt.getSubject()), SessionRoles.of(jwt)));
    }

    @PatchMapping
    DonorResponse update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateDonorProfileRequest request) {
        return DonorResponse.of(profiles.updateProfile(DonorId.of(jwt.getSubject()), SessionRoles.of(jwt), request.toCommand()));
    }
}
