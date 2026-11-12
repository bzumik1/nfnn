package cz.novanadeje.app.donations.interfaces.rest;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record HistoryImportRequest(@NotNull LocalDate from) {
}
