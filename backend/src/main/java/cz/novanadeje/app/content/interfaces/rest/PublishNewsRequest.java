package cz.novanadeje.app.content.interfaces.rest;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record PublishNewsRequest(@NotNull LocalDate publishedOn) {
}
