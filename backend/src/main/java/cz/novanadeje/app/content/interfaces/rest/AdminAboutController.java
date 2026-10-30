package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.about.AboutService;
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
@RequestMapping("/api/admin/content/about")
class AdminAboutController {

    private final AboutService about;

    AdminAboutController(AboutService about) {
        this.about = about;
    }

    @GetMapping
    AboutResponse read() {
        return AboutResponse.from(about.read());
    }

    @PutMapping
    AboutResponse change(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AboutRequest request) {
        return AboutResponse.from(about.change(UUID.fromString(jwt.getSubject()), request.toCommand()));
    }
}
