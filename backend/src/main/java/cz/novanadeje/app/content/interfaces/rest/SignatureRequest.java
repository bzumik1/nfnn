package cz.novanadeje.app.content.interfaces.rest;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record SignatureRequest(@NotNull UUID imageId) {
}
