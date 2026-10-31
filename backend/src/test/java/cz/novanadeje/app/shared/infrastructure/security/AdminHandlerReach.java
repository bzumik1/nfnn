package cz.novanadeje.app.shared.infrastructure.security;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

enum AdminHandlerReach {

    CONNECTOR,
    CONNECTOR_SECRETS_IN_BROWSER_ONLY,
    CONNECTOR_REPLACEMENTS_IN_BROWSER_ONLY,
    BROWSER_ONLY;

    static final Map<String, AdminHandlerReach> CLASSIFIED = classified();

    static Set<String> unclassified(Collection<String> handlers, Map<String, AdminHandlerReach> table) {
        Set<String> missing = new TreeSet<>(handlers);
        missing.removeAll(table.keySet());
        return missing;
    }

    static Set<String> stale(Collection<String> handlers, Map<String, AdminHandlerReach> table) {
        Set<String> stale = new TreeSet<>(table.keySet());
        stale.removeAll(handlers);
        return stale;
    }

    boolean reachedBy(boolean browser, boolean writing, String method) {
        if (browser) {
            return true;
        }
        if (this == BROWSER_ONLY) {
            return false;
        }
        return writing || List.of("GET", "HEAD").contains(method);
    }

    private static Map<String, AdminHandlerReach> classified() {
        Map<String, AdminHandlerReach> table = new LinkedHashMap<>();
        table.put("GET /api/admin/content/about", CONNECTOR);
        table.put("PUT /api/admin/content/about", CONNECTOR);
        table.put("POST /api/admin/content/media", CONNECTOR);
        table.put("GET /api/admin/content/news", CONNECTOR);
        table.put("POST /api/admin/content/news", CONNECTOR);
        table.put("GET /api/admin/content/news/{id}", CONNECTOR);
        table.put("PUT /api/admin/content/news/{id}", CONNECTOR);
        table.put("DELETE /api/admin/content/news/{id}", BROWSER_ONLY);
        table.put("POST /api/admin/content/news/{id}/publish", CONNECTOR);
        table.put("POST /api/admin/content/news/{id}/unpublish", CONNECTOR);
        table.put("GET /api/admin/content/people", CONNECTOR);
        table.put("GET /api/admin/content/people/me", CONNECTOR);
        table.put("POST /api/admin/content/people", CONNECTOR);
        table.put("PUT /api/admin/content/people/order", CONNECTOR);
        table.put("PUT /api/admin/content/people/note", CONNECTOR);
        table.put("PUT /api/admin/content/people/footnote", CONNECTOR);
        table.put("PUT /api/admin/content/people/{id}", CONNECTOR);
        table.put("DELETE /api/admin/content/people/{id}", CONNECTOR);
        table.put("POST /api/admin/content/people/{id}/web-signature", CONNECTOR);
        table.put("DELETE /api/admin/content/people/{id}/web-signature", CONNECTOR);
        table.put("GET /api/admin/content/project-order", CONNECTOR);
        table.put("PUT /api/admin/content/project-order", CONNECTOR);
        table.put("GET /api/admin/content/projects", CONNECTOR);
        table.put("POST /api/admin/content/projects", CONNECTOR);
        table.put("GET /api/admin/content/projects/{id}", CONNECTOR);
        table.put("PUT /api/admin/content/projects/{id}", CONNECTOR);
        table.put("DELETE /api/admin/content/projects/{id}", BROWSER_ONLY);
        table.put("POST /api/admin/content/projects/{id}/publish", CONNECTOR);
        table.put("POST /api/admin/content/projects/{id}/unpublish", CONNECTOR);
        table.put("GET /api/admin/donations/donors", CONNECTOR);
        table.put("GET /api/admin/donations/donors/{donorId}", CONNECTOR);
        table.put("DELETE /api/admin/donations/donors/{donorId}/bank-accounts/{linkId}", BROWSER_ONLY);
        table.put("POST /api/admin/donations/donors/{donorId}/bank-accounts/{linkId}/disconnect", CONNECTOR);
        table.put("POST /api/admin/donations/donors/{donorId}/bank-accounts/{linkId}/reconnect", CONNECTOR);
        table.put("POST /api/admin/donations/donors/{donorId}/receipts", CONNECTOR_REPLACEMENTS_IN_BROWSER_ONLY);
        table.put("GET /api/admin/donations/import-state", CONNECTOR);
        table.put("GET /api/admin/donations/overview", CONNECTOR);
        table.put("GET /api/admin/donations/overview/since", CONNECTOR);
        table.put("GET /api/admin/donations/payments", CONNECTOR);
        table.put("POST /api/admin/donations/payments/{id}/pair", CONNECTOR);
        table.put("POST /api/admin/donations/payments/{id}/unpair", CONNECTOR);
        table.put("GET /api/admin/donations/receipt-images/{sha256}", CONNECTOR);
        table.put("GET /api/admin/donations/receipt-signature", CONNECTOR);
        table.put("POST /api/admin/donations/receipt-signature", BROWSER_ONLY);
        table.put("DELETE /api/admin/donations/receipt-signature", BROWSER_ONLY);
        table.put("GET /api/admin/donations/receipt-signing-keys", CONNECTOR);
        table.put("GET /api/admin/donations/receipts", CONNECTOR);
        table.put("GET /api/admin/donations/receipts/{id}", CONNECTOR);
        table.put("GET /api/admin/donations/report", CONNECTOR);
        table.put("POST /api/admin/donations/report/send", CONNECTOR);
        table.put("PUT /api/admin/donations/report/settings", CONNECTOR);
        table.put("GET /api/admin/donations/symbol-claims", CONNECTOR);
        table.put("DELETE /api/admin/donations/symbol-claims/{id}", BROWSER_ONLY);
        table.put("POST /api/admin/donations/symbol-claims/{id}/reverse", BROWSER_ONLY);
        table.put("GET /api/admin/donors", CONNECTOR);
        table.put("GET /api/admin/donors/actions", CONNECTOR);
        table.put("GET /api/admin/donors/administrators", CONNECTOR);
        table.put("POST /api/admin/donors/administrators", BROWSER_ONLY);
        table.put("DELETE /api/admin/donors/administrators/{donorId}", BROWSER_ONLY);
        table.put("GET /api/admin/donors/me/previous-sign-in", CONNECTOR);
        table.put("GET /api/admin/donors/{donorId}", CONNECTOR);
        table.put("DELETE /api/admin/donors/{donorId}", BROWSER_ONLY);
        table.put("DELETE /api/admin/donors/{donorId}/passkeys", BROWSER_ONLY);
        table.put("POST /api/admin/donors/{donorId}/second-factor/reset", BROWSER_ONLY);
        table.put("GET /api/admin/operations/backups", CONNECTOR);
        table.put("POST /api/admin/operations/backups/key/confirmation", BROWSER_ONLY);
        table.put("POST /api/admin/operations/backups/key/reveal", BROWSER_ONLY);
        table.put("POST /api/admin/operations/backups/requests", CONNECTOR);
        table.put("PUT /api/admin/operations/backups/schedule", CONNECTOR);
        table.put("GET /api/admin/operations/backups/{fileName}", BROWSER_ONLY);
        table.put("POST /api/admin/operations/backups/{fileName}/restore", BROWSER_ONLY);
        table.put("GET /api/admin/operations/diagnostics", CONNECTOR);
        table.put("GET /api/admin/operations/diagnostics/threads", CONNECTOR);
        table.put("GET /api/admin/operations/loggers", CONNECTOR);
        table.put("PUT /api/admin/operations/loggers/{logger}", CONNECTOR);
        table.put("DELETE /api/admin/operations/loggers/{logger}", CONNECTOR);
        table.put("GET /api/admin/operations/logs", CONNECTOR);
        table.put("GET /api/admin/operations/logs/{name}", CONNECTOR);
        table.put("GET /api/admin/operations/logs/{name}/search", CONNECTOR);
        table.put("GET /api/admin/operations/settings", CONNECTOR);
        table.put("PUT /api/admin/operations/settings", CONNECTOR_SECRETS_IN_BROWSER_ONLY);
        table.put("POST /api/admin/operations/settings/test-email", CONNECTOR_SECRETS_IN_BROWSER_ONLY);
        return Map.copyOf(table);
    }
}
