package cz.novanadeje.app.cucumber.transcript;

public record RecordedLogLine(String level, String logger, String message, String exception) {
}
