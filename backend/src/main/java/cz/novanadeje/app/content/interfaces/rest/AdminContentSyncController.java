package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.sync.AdminContentSyncService;
import cz.novanadeje.app.content.application.sync.AdminContentSyncSnapshot;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/content/sync")
class AdminContentSyncController {

    static final int MAXIMUM_CHUNKS_PER_REQUEST = 64;
    static final String CHUNK_ID = "news|projects|project-order|about|donate-band|people";
    private static final String NOT_STORED_BY_ANY_CACHE = "private, no-store";

    private final AdminContentSyncService sync;
    private final AdminContentSyncProjection projection;
    private final AdminContentSyncRateLimiter rateLimiter;

    AdminContentSyncController(AdminContentSyncService sync, AdminContentSyncProjection projection, AdminContentSyncRateLimiter rateLimiter) {
        this.sync = sync;
        this.projection = projection;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping
    ResponseEntity<AdminContentSyncManifestResponse> manifest(@AuthenticationPrincipal Jwt jwt) {
        rateLimiter.check(jwt.getSubject());
        AdminContentSyncSnapshot snapshot = sync.snapshotFor(UUID.fromString(jwt.getSubject()));
        return notStored(AdminContentSyncManifestResponse.of(snapshot.subject(), snapshot.administrator(), projection.chunksOf(snapshot)));
    }

    @GetMapping("/chunks")
    ResponseEntity<AdminContentSyncChunksResponse> chunks(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam @NotEmpty(message = "{problem.validation.missing-value}")
            @Size(max = MAXIMUM_CHUNKS_PER_REQUEST, message = "{problem.validation.invalid-value}")
            List<@Pattern(regexp = CHUNK_ID, message = "{problem.validation.invalid-value}") String> ids
    ) {
        rateLimiter.check(jwt.getSubject());
        AdminContentSyncSnapshot snapshot = sync.snapshotFor(UUID.fromString(jwt.getSubject()));
        SyncChunk.Asked asked = SyncChunk.asked(projection.chunksOf(snapshot), ids);
        return notStored(new AdminContentSyncChunksResponse(snapshot.subject(), snapshot.administrator(), asked.chunks(), asked.missing()));
    }

    private static <T> ResponseEntity<T> notStored(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, NOT_STORED_BY_ANY_CACHE).body(body);
    }
}
