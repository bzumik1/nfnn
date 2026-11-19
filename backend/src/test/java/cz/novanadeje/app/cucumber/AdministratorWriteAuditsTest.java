package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.cucumber.transcript.AuditedExchange;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AdministratorWriteAuditsTest {

    private static final String PERSON = "0192f0f1-0000-7000-8000-000000000001";

    @Test
    @DisplayName("Given an administrator write that answered 2xx and added no audit row, when the scenario's requests are checked, then it is reported by its path template")
    void should_report_an_unaudited_write_when_checked_given_no_new_audit_row() {
        List<AuditedExchange> exchanges = List.of(new AuditedExchange(1, "DELETE", "/api/admin/content/people/" + PERSON + "?force=true", 204, 3, 3));

        assertThat(AdministratorWriteAudits.unaudited(exchanges, Map.of())).containsExactly("DELETE /api/admin/content/people/{id} answered 204");
    }

    @Test
    @DisplayName("Given an audited write, a read, a refused write, a write outside the administration and an allowed write, when they are checked, then none is reported")
    void should_report_nothing_when_checked_given_writes_that_need_no_new_row() {
        List<AuditedExchange> exchanges = List.of(
                new AuditedExchange(1, "PUT", "/api/admin/donations/report", 200, 0, 1),
                new AuditedExchange(2, "GET", "/api/admin/donations/report", 200, 1, 1),
                new AuditedExchange(3, "PUT", "/api/admin/donations/report", 409, 1, 1),
                new AuditedExchange(4, "POST", "/api/donors/me/profile", 200, 1, 1),
                new AuditedExchange(5, "POST", "/api/admin/operations/settings/test-email", 202, 1, 1));

        assertThat(AdministratorWriteAudits.unaudited(exchanges, Map.of("POST /api/admin/operations/settings/test-email", "planted: sends a probe")))
                .isEmpty();
    }

    @Test
    @DisplayName("Given two writes sent at once in one window that added a single audit row, when they are checked, then both are reported, and with two rows neither is")
    void should_count_the_rows_of_a_concurrent_window_when_checked_given_two_writes() {
        List<AuditedExchange> oneRow = List.of(
                new AuditedExchange(7, "POST", "/api/admin/donations/payments/12/pairing", 200, 4, 5),
                new AuditedExchange(7, "POST", "/api/admin/donations/payments/13/pairing", 200, 4, 5));
        List<AuditedExchange> twoRows = List.of(
                new AuditedExchange(7, "POST", "/api/admin/donations/payments/12/pairing", 200, 4, 5),
                new AuditedExchange(7, "POST", "/api/admin/donations/payments/13/pairing", 200, 4, 6));

        assertThat(AdministratorWriteAudits.unaudited(oneRow, Map.of())).hasSize(2)
                .allSatisfy(write -> assertThat(write).isEqualTo("POST /api/admin/donations/payments/{n}/pairing answered 200"));
        assertThat(AdministratorWriteAudits.unaudited(twoRows, Map.of())).isEmpty();
    }

    @Test
    @DisplayName("Given paths with an id, a digest, a key id and a number, when their template is read, then each segment is replaced by its placeholder and the query is dropped")
    void should_replace_every_variable_segment_when_read_given_paths() {
        assertThat(AdministratorWriteAudits.templateOf(new AuditedExchange(1, "POST",
                "/api/admin/donations/receipt-signing-keys/21fe00aa/withdrawal/" + "a".repeat(64) + "/" + PERSON + "/2026?year=2026", 200, 0, 0)))
                .isEqualTo("POST /api/admin/donations/receipt-signing-keys/{keyId}/withdrawal/{sha256}/{id}/{n}");
    }
}
