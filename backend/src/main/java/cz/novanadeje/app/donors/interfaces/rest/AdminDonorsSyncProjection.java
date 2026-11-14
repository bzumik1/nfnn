package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminAccountsSyncSnapshot;
import cz.novanadeje.app.donors.application.DonorAccountView;
import cz.novanadeje.app.donors.application.AdminActionView;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunkEntry;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunkRows;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
class AdminDonorsSyncProjection {

    static final String ACCOUNTS = "accounts:";
    static final String AUDIT = "audit:";

    private static final Comparator<DonorAccountView> OLDER_REGISTRATION_FIRST = Comparator.comparing((DonorAccountView account) -> account.donor().registeredAt())
            .thenComparing(account -> account.donor().id().value().toString());

    private final JsonMapper json;
    private final AdminActionSummaries summaries;

    AdminDonorsSyncProjection(JsonMapper json, AdminActionSummaries summaries) {
        this.json = json;
        this.summaries = summaries;
    }

    List<SyncChunk> chunksOf(AdminAccountsSyncSnapshot snapshot) {
        return rowsOf(snapshot, SyncChunkRows.every()).chunks(json);
    }

    List<SyncChunkEntry> entriesOf(AdminAccountsSyncSnapshot snapshot) {
        return rowsOf(snapshot, SyncChunkRows.every()).entries(json);
    }

    List<SyncChunk> chunksOf(AdminAccountsSyncSnapshot snapshot, List<String> ids) {
        return rowsOf(snapshot, SyncChunkRows.only(ids)).chunks(json);
    }

    private SyncChunkRows rowsOf(AdminAccountsSyncSnapshot snapshot, SyncChunkRows chunks) {
        snapshot.accounts().stream().sorted(OLDER_REGISTRATION_FIRST).forEach(account ->
                chunks.add(ACCOUNTS + SyncChunk.monthOf(account.donor().registeredAt()), () -> DonorAccountResponse.from(account)));
        snapshot.actions().forEach(action -> chunks.add(AUDIT + SyncChunk.monthOf(action.performedAt()),
                () -> AuditRow.from(action, summaries.sentenceOnADevice(action))));
        return chunks;
    }

    record AuditRow(UUID id, UUID adminId, String action, UUID subjectId, UUID donorId, String summary, Instant performedAt, String client) {

        static AuditRow from(AdminActionView entry, Optional<String> summary) {
            return new AuditRow(entry.id(), entry.adminId(), entry.action(), entry.subjectId().orElse(null), entry.donorId().orElse(null),
                    summary.orElse(null), entry.performedAt(), entry.client().orElse(null));
        }
    }
}
