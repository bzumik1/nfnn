package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.SetupAccess;
import cz.novanadeje.app.operations.application.settings.SetupService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/operations/setup")
class SetupController {

    private final SetupService setup;
    private final HomeNetworkRequests homeNetwork;
    private final SetupRateLimiter rateLimiter;

    SetupController(SetupService setup, HomeNetworkRequests homeNetwork, SetupRateLimiter rateLimiter) {
        this.setup = setup;
        this.homeNetwork = homeNetwork;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping
    SetupStatusResponse status(HttpServletRequest http) {
        return SetupStatusResponse.from(setup.status(homeNetwork.isDirectFromHomeNetwork(http)));
    }

    @PostMapping("/unlock")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unlock(HttpServletRequest http, @Valid @RequestBody SetupCodeRequest request) {
        rateLimiter.check(http.getRemoteAddr());
        setup.unlock(access(http, request.code()));
    }

    @PostMapping("/mail-test")
    MailTestResponse testMail(HttpServletRequest http, @Valid @RequestBody MailTestRequest request) {
        rateLimiter.check(http.getRemoteAddr());
        return new MailTestResponse(setup.testMail(access(http, request.code()), request.toServer()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    SettingsSavedResponse complete(HttpServletRequest http, @Valid @RequestBody SetupRequest request) {
        rateLimiter.check(http.getRemoteAddr());
        return SettingsSavedResponse.of(setup.complete(access(http, request.code()), SettingValueRequest.toChanges(request.settings())));
    }

    private SetupAccess access(HttpServletRequest http, String code) {
        return new SetupAccess(homeNetwork.isDirectFromHomeNetwork(http), code);
    }
}
