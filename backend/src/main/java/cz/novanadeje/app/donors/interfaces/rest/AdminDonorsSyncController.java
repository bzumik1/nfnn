package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminAccountsSyncService;
import cz.novanadeje.app.donors.application.AdminAccountsSyncSnapshot;
import cz.novanadeje.app.donors.domain.DonorId;
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

@RestController
@RequestMapping("/api/admin/donors/sync")
class AdminDonorsSyncController {

    static final int MAXIMUM_CHUNKS_PER_REQUEST = 64;
    static final String CHUNK_ID = "(accounts|audit):[0-9]{4}-(0[1-9]|1[0-2])";
    private static final String NOT_STORED_BY_ANY_CACHE = "private, no-store";

    private final AdminAccountsSyncService sync;
    private final AdminDonorsSyncProjection projection;
    private final AdminDonorsSyncRateLimiter rateLimiter;

    AdminDonorsSyncController(AdminAccountsSyncService sync, AdminDonorsSyncProjection projection, AdminDonorsSyncRateLimiter rateLimiter) {
        this.sync = sync;
        this.projection = projection;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping
    ResponseEntity<AdminDonorsSyncManifestResponse> manifest(@AuthenticationPrincipal Jwt jwt) {
        rateLimiter.check(jwt.getSubject());
        AdminAccountsSyncSnapshot snapshot = sync.snapshotFor(DonorId.of(jwt.getSubject()));
        return notStored(AdminDonorsSyncManifestResponse.from(snapshot, projection.entriesOf(snapshot)));
    }

    @GetMapping("/chunks")
    ResponseEntity<AdminDonorsSyncChunksResponse> chunks(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam @NotEmpty(message = "{problem.validation.missing-value}")
            @Size(max = MAXIMUM_CHUNKS_PER_REQUEST, message = "{problem.validation.invalid-value}")
            List<@Pattern(regexp = CHUNK_ID, message = "{problem.validation.invalid-value}") String> ids
    ) {
        rateLimiter.check(jwt.getSubject());
        AdminAccountsSyncSnapshot snapshot = sync.snapshotFor(DonorId.of(jwt.getSubject()));
        SyncChunk.Asked asked = SyncChunk.asked(projection.chunksOf(snapshot, ids), ids);
        return notStored(new AdminDonorsSyncChunksResponse(snapshot.subject().value(), snapshot.administrator(), asked.chunks(), asked.missing()));
    }

    private static <T> ResponseEntity<T> notStored(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, NOT_STORED_BY_ANY_CACHE).body(body);
    }
}
