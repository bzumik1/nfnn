package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.SettingsService;
import cz.novanadeje.app.operations.domain.settings.SecretSettingsInBrowserOnly;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import jakarta.servlet.http.HttpServletRequest;
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
    private final TestEmailRateLimiter testEmailRateLimiter;

    AdminSettingsController(SettingsService settings, TestEmailRateLimiter testEmailRateLimiter) {
        this.settings = settings;
        this.testEmailRateLimiter = testEmailRateLimiter;
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

    @PostMapping("/test-email")
    TestEmailResponse sendTestEmail(HttpServletRequest http, @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AdminTestEmailRequest request) {
        testEmailRateLimiter.check(http.getRemoteAddr());
        if (jwt.hasClaim(SCOPE_CLAIM) && request.typesPassword()) {
            throw new SecretSettingsInBrowserOnly();
        }
        return TestEmailResponse.from(settings.sendTestEmail(UUID.fromString(jwt.getSubject()), request.toServer(), request.sender()));
    }
}
