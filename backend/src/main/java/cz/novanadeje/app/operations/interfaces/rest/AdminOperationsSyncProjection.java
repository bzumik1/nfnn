package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.sync.AdminOperations;
import cz.novanadeje.app.operations.application.sync.AdminOperationsSyncSnapshot;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

@Component
class AdminOperationsSyncProjection {

    static final String SETTINGS = "settings";
    static final String BACKUPS = "backups";

    private final JsonMapper json;

    AdminOperationsSyncProjection(JsonMapper json) {
        this.json = json;
    }

    List<SyncChunk> chunksOf(AdminOperationsSyncSnapshot snapshot) {
        SortedMap<String, List<?>> chunks = new TreeMap<>();
        snapshot.operations().ifPresent(operations -> rowsOf(operations, chunks));
        return SyncChunk.allOf(chunks, json);
    }

    private static void rowsOf(AdminOperations operations, SortedMap<String, List<?>> chunks) {
        chunks.put(SETTINGS, List.of(SettingsResponse.from(operations.settings())));
        chunks.put(BACKUPS, List.of(AdminBackupsResponse.from(operations.backups(), operations.backupSchedule(), operations.backupKey())
                .withoutRunErrors()));
    }
}
