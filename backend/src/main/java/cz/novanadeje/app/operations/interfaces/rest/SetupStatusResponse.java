package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.SetupStatusView;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;

import java.time.Instant;

record SetupStatusResponse(boolean required, boolean codeRequired, LastRestore lastRestore) {

    static SetupStatusResponse from(SetupStatusView view) {
        return new SetupStatusResponse(view.required(), view.codeRequired(), view.lastRestore().map(LastRestore::from).orElse(null));
    }

    record LastRestore(String requestId, RunOutcome outcome, Instant finishedAt, String error) {

        static LastRestore from(BackupRun run) {
            return new LastRestore(run.requestId().orElse(null), run.outcome(), run.finishedAt(), run.error().orElse(null));
        }
    }
}
