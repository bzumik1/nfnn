package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.logs.LogFilesView;
import cz.novanadeje.app.operations.domain.logs.LogFile;

import java.time.Instant;
import java.util.List;

record LogFilesResponse(boolean available, List<Item> files) {

    static LogFilesResponse from(LogFilesView view) {
        return new LogFilesResponse(view.available(), view.files().stream().map(Item::from).toList());
    }

    record Item(String name, long sizeBytes, Instant changedAt, boolean compressed) {

        static Item from(LogFile file) {
            return new Item(file.name(), file.sizeBytes(), file.changedAt(), file.compressed());
        }
    }
}
