package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.logs.LogWindow;

record LogWindowResponse(String name, long sizeBytes, long from, long to, boolean hasOlder, boolean hasNewer, String text) {

    static LogWindowResponse from(LogWindow window) {
        return new LogWindowResponse(window.name(), window.sizeBytes(), window.from(), window.to(), window.hasOlder(), window.hasNewer(),
                window.text());
    }
}
