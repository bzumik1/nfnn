package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.backup.BackupKeyWordPositions;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

record BackupKeyConfirmationRequest(@NotNull @Size(min = BackupKeyWordPositions.ASKED, max = BackupKeyWordPositions.ASKED) List<@Valid @NotNull BackupKeyWordRequest> words) {
}
