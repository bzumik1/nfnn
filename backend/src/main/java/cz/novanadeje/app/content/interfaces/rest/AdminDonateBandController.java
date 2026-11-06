package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.donateband.DonateBandService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/content/donate-band")
class AdminDonateBandController {

    private final DonateBandService band;

    AdminDonateBandController(DonateBandService band) {
        this.band = band;
    }

    @GetMapping
    DonateBandResponse read() {
        return DonateBandResponse.from(band.read());
    }

    @PutMapping
    DonateBandResponse change(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DonateBandRequest request) {
        return DonateBandResponse.from(band.change(UUID.fromString(jwt.getSubject()), request.toCommand()));
    }
}
