package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.cucumber.transcript.ApiTranscriptRecorder;
import io.cucumber.java.After;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class AdministratorWriteAuditHooks {

    static final Map<String, String> WRITES_WITHOUT_AN_AUDIT_ENTRY = Map.of();

    private final ApiTranscriptRecorder recorder;

    public AdministratorWriteAuditHooks(ApiTranscriptRecorder recorder) {
        this.recorder = recorder;
    }

    @After
    public void everyAdministratorWriteWasAudited() {
        assertThat(AdministratorWriteAudits.unaudited(recorder.auditedExchanges(), WRITES_WITHOUT_AN_AUDIT_ENTRY))
                .as("administrator writes under /api/admin/ that answered 2xx without adding an admin_action row (security.md: every "
                        + "administrator's change publishes AdminActionPerformed); a write that changes nothing an administrator must answer for "
                        + "goes into AdministratorWriteAuditHooks.WRITES_WITHOUT_AN_AUDIT_ENTRY with its reason")
                .isEmpty();
    }
}
