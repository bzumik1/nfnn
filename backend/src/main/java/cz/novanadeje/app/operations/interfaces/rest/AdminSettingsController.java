package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.SettingsService;
import cz.novanadeje.app.operations.domain.settings.SecretSettingsInBrowserOnly;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/operations/settings")
class AdminSettingsController {

    private static final String SCOPE_CLAIM = "scope";

    private final SettingsService settings;

    AdminSettingsController(SettingsService settings) {
        this.settings = settings;
    }

    @GetMapping
    SettingsResponse settings() {
        return SettingsResponse.from(settings.view());
    }

    @PutMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    SettingsSavedResponse change(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SettingsChangeRequest request) {
        List<SettingChange> changes = SettingValueRequest.toChanges(request.changes());
        if (jwt.hasClaim(SCOPE_CLAIM) && changes.stream().anyMatch(change -> change.setting().changesOnlyInBrowser())) {
            throw new SecretSettingsInBrowserOnly();
        }
        return SettingsSavedResponse.of(settings.change(UUID.fromString(jwt.getSubject()), changes));
    }

    @PostMapping("/mail-test")
    MailTestResponse testMail(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody MailTestRequest request) {
        if (jwt.hasClaim(SCOPE_CLAIM) && request.password() != null && !request.password().isBlank()) {
            throw new SecretSettingsInBrowserOnly();
        }
        return new MailTestResponse(settings.testMail(request.toServer()));
    }
}
