package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record BackupKeyConfirmationRequest(@NotBlank @Size(max = BackupKey.CHECK_LENGTH + 2) String check) {
}
