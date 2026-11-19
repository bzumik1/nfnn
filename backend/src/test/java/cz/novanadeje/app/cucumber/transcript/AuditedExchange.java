package cz.novanadeje.app.cucumber.transcript;

public record AuditedExchange(int window, String method, String path, int status, long auditRowsBefore, long auditRowsAfter,
                              boolean stateUnchanged) {
}
