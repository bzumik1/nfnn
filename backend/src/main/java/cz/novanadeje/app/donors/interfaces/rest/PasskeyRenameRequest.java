package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.Passkey;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record PasskeyRenameRequest(@NotBlank @Size(max = Passkey.MAX_NAME_LENGTH) String name) {
}
