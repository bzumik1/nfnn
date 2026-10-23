package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.backup.BackupRequestKind;
import jakarta.validation.constraints.NotNull;

record BackupRequestRequest(@NotNull BackupRequestKind kind) {
}
