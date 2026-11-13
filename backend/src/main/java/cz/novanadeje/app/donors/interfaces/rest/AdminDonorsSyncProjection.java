package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminAccountsSyncSnapshot;
import cz.novanadeje.app.donors.application.DonorAccountView;
import cz.novanadeje.app.donors.application.AdminActionView;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.SortedMap;
import java.util.TreeMap;
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
        SortedMap<String, List<Object>> chunks = new TreeMap<>();
        snapshot.accounts().stream().sorted(OLDER_REGISTRATION_FIRST).forEach(account ->
                rowsOf(chunks, ACCOUNTS + SyncChunk.monthOf(account.donor().registeredAt())).add(DonorAccountResponse.from(account)));
        snapshot.actions().forEach(action -> rowsOf(chunks, AUDIT + SyncChunk.monthOf(action.performedAt())).add(AuditRow.from(action, summaries.sentenceOnADevice(action))));
        return SyncChunk.allOf(chunks, json);
    }

    private static List<Object> rowsOf(SortedMap<String, List<Object>> chunks, String id) {
        return chunks.computeIfAbsent(id, ignored -> new ArrayList<>());
    }

    record AuditRow(UUID id, UUID adminId, String action, UUID subjectId, UUID donorId, String summary, Instant performedAt, String client) {

        static AuditRow from(AdminActionView entry, Optional<String> summary) {
            return new AuditRow(entry.id(), entry.adminId(), entry.action(), entry.subjectId().orElse(null), entry.donorId().orElse(null),
                    summary.orElse(null), entry.performedAt(), entry.client().orElse(null));
        }
    }
}
