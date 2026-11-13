package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.sync.AdminDonationsSyncService;
import cz.novanadeje.app.donations.application.sync.AdminDonationsSyncSnapshot;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
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
@RequestMapping("/api/admin/donations/sync")
class AdminDonationsSyncController {

    static final int MAXIMUM_CHUNKS_PER_REQUEST = 64;
    static final String CHUNK_ID = "(payments|donations|donor-records|links):[0-9]{4}-(0[1-9]|1[0-2])|receipts:[0-9]{4}"
            + "|symbol-claims|import-state|report-settings";
    private static final String NOT_STORED_BY_ANY_CACHE = "private, no-store";

    private final AdminDonationsSyncService sync;
    private final AdminDonationsSyncProjection projection;
    private final AdminDonationsSyncRateLimiter rateLimiter;
    private final FirstReceiptYear firstReceiptYear;

    AdminDonationsSyncController(AdminDonationsSyncService sync, AdminDonationsSyncProjection projection, AdminDonationsSyncRateLimiter rateLimiter,
                                 FirstReceiptYear firstReceiptYear) {
        this.sync = sync;
        this.projection = projection;
        this.rateLimiter = rateLimiter;
        this.firstReceiptYear = firstReceiptYear;
    }

    @GetMapping
    ResponseEntity<AdminDonationsSyncManifestResponse> manifest(@AuthenticationPrincipal Jwt jwt) {
        rateLimiter.check(jwt.getSubject());
        AdminDonationsSyncSnapshot snapshot = sync.snapshotFor(DonorReference.of(jwt.getSubject()));
        return notStored(AdminDonationsSyncManifestResponse.from(snapshot, firstReceiptYear, projection.entriesOf(snapshot)));
    }

    @GetMapping("/chunks")
    ResponseEntity<AdminDonationsSyncChunksResponse> chunks(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam @NotEmpty(message = "{problem.validation.missing-value}")
            @Size(max = MAXIMUM_CHUNKS_PER_REQUEST, message = "{problem.validation.invalid-value}")
            List<@Pattern(regexp = CHUNK_ID, message = "{problem.validation.invalid-value}") String> ids
    ) {
        rateLimiter.check(jwt.getSubject());
        AdminDonationsSyncSnapshot snapshot = sync.snapshotFor(DonorReference.of(jwt.getSubject()));
        SyncChunk.Asked asked = SyncChunk.asked(projection.chunksOf(snapshot, ids), ids);
        return notStored(new AdminDonationsSyncChunksResponse(snapshot.subject().value(), snapshot.administrator(),
                AdminDonationsSyncSummaryResponse.from(snapshot, firstReceiptYear), asked.chunks(), asked.missing()));
    }

    private static <T> ResponseEntity<T> notStored(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, NOT_STORED_BY_ANY_CACHE).body(body);
    }
}
