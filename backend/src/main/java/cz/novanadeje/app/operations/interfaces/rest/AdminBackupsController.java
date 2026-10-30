package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.backup.BackupAdministrationService;
import cz.novanadeje.app.operations.application.backup.BackupDownload;
import cz.novanadeje.app.operations.application.backup.BackupKeyService;
import cz.novanadeje.app.operations.application.backup.BackupRestoreService;
import cz.novanadeje.app.operations.application.backup.BackupScheduleService;
import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.shared.interfaces.rest.FreshSecondFactorRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@Validated
@RequestMapping("/api/admin/operations/backups")
class AdminBackupsController {

    private static final String NOT_STORED_BY_ANY_CACHE = "private, no-store";

    private final BackupAdministrationService backups;
    private final BackupRestoreService restores;
    private final BackupScheduleService schedules;
    private final BackupKeyService keys;
    private final BackupKeyRateLimiter keyRateLimiter;

    AdminBackupsController(BackupAdministrationService backups, BackupRestoreService restores, BackupScheduleService schedules, BackupKeyService keys,
                           BackupKeyRateLimiter keyRateLimiter) {
        this.backups = backups;
        this.restores = restores;
        this.schedules = schedules;
        this.keys = keys;
        this.keyRateLimiter = keyRateLimiter;
    }

    @GetMapping
    AdminBackupsResponse backups() {
        return AdminBackupsResponse.from(backups.view(), schedules.view(), keys.view());
    }

    @PostMapping("/key/reveal")
    ResponseEntity<BackupKeyResponse> revealKey(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody FreshSecondFactorRequest request, HttpServletRequest http) {
        keyRateLimiter.check(http.getRemoteAddr());
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, NOT_STORED_BY_ANY_CACHE)
                .body(BackupKeyResponse.of(keys.reveal(admin(jwt), request.toProof())));
    }

    @PostMapping("/key/confirmation")
    AdminBackupsResponse.Key confirmKey(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BackupKeyConfirmationRequest request, HttpServletRequest http) {
        keyRateLimiter.check(http.getRemoteAddr());
        return AdminBackupsResponse.Key.from(keys.confirm(admin(jwt), BackupKeyWordRequest.toChecks(request.words())));
    }

    @PutMapping("/schedule")
    BackupScheduleResponse changeSchedule(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BackupScheduleRequest request) {
        schedules.change(admin(jwt), request.toSchedule());
        return BackupScheduleResponse.from(schedules.view());
    }

    @PostMapping("/requests")
    @ResponseStatus(HttpStatus.ACCEPTED)
    BackupRequestResponse request(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BackupRequestRequest request) {
        return BackupRequestResponse.from(backups.request(admin(jwt), request.kind()));
    }

    @GetMapping("/{fileName}")
    ResponseEntity<Resource> download(@AuthenticationPrincipal Jwt jwt, @PathVariable @Size(max = BackupFile.MAX_NAME_LENGTH) String fileName) {
        BackupDownload download = backups.download(admin(jwt), fileName);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(download.file().sizeBytes())
                .header(HttpHeaders.CACHE_CONTROL, NOT_STORED_BY_ANY_CACHE)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(download.file().name(), StandardCharsets.UTF_8).build().toString())
                .body(new FileSystemResource(download.path()));
    }

    @PostMapping("/{fileName}/restore")
    @ResponseStatus(HttpStatus.ACCEPTED)
    RestoreRequestResponse restore(@AuthenticationPrincipal Jwt jwt, @PathVariable @Size(max = BackupFile.MAX_NAME_LENGTH) String fileName) {
        return RestoreRequestResponse.from(restores.restoreBackup(admin(jwt), fileName));
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
