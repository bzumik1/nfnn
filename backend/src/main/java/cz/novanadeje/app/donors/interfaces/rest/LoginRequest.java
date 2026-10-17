package cz.novanadeje.app.donors.interfaces.rest;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record LoginRequest(
        @NotBlank @Size(max = 254) String email,
        @NotBlank @Size(max = 128) String password
) {
}
