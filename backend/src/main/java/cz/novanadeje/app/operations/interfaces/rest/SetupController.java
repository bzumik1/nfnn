package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.SetupAccess;
import cz.novanadeje.app.operations.application.settings.SetupService;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.Optional;

@RestController
@Validated
@RequestMapping("/api/operations/setup")
class SetupController {

    static final String CODE_HEADER = "X-Nfnn-Setup-Code";
    static final String BACKUP_KEY_HEADER = "X-Nfnn-Backup-Key";
    private static final String NOT_STORED_BY_ANY_CACHE = "private, no-store";

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

    @GetMapping("/backup-key")
    ResponseEntity<BackupKeyResponse> backupKey(HttpServletRequest http,
                                                @RequestHeader(name = CODE_HEADER, required = false) @Size(max = SetupCodeRequest.MAX_CODE_LENGTH) String code) {
        rateLimiter.check(http.getRemoteAddr());
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, NOT_STORED_BY_ANY_CACHE).body(BackupKeyResponse.of(setup.backupKey(access(http, code))));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    SettingsSavedResponse complete(HttpServletRequest http, @Valid @RequestBody SetupRequest request) {
        rateLimiter.check(http.getRemoteAddr());
        return SettingsSavedResponse.of(setup.complete(access(http, request.code()), SettingValueRequest.toChanges(request.settings()), request.backupKeyCheck()));
    }

    @PutMapping(path = "/restore", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    RestoreRequestResponse restore(HttpServletRequest http, @RequestHeader(name = CODE_HEADER, required = false) @Size(max = SetupCodeRequest.MAX_CODE_LENGTH) String code,
                                   @RequestHeader(name = BACKUP_KEY_HEADER, required = false) @Size(max = BackupKey.MAX_LENGTH) String backupKey)
            throws IOException {
        rateLimiter.check(http.getRemoteAddr());
        Optional<BackupKey> key = Optional.ofNullable(backupKey).filter(value -> !value.isBlank()).map(BackupKey::new);
        return RestoreRequestResponse.from(setup.restoreUpload(access(http, code), http.getInputStream(), key));
    }

    private SetupAccess access(HttpServletRequest http, String code) {
        return new SetupAccess(homeNetwork.isDirectFromHomeNetwork(http), code);
    }
}
