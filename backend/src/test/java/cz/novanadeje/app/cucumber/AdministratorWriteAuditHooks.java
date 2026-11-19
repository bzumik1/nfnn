package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.cucumber.AdministratorWriteAudits.StateProbe;
import cz.novanadeje.app.cucumber.transcript.ApiTranscriptRecorder;
import io.cucumber.java.After;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class AdministratorWriteAuditHooks {

    static final Map<String, String> WRITES_WITHOUT_AN_AUDIT_ENTRY = Map.of(
            "POST /api/admin/operations/push/test",
            "sends a test alert to the administrator's own subscribed devices and changes no setting, so it is no administrator's change "
                    + "(security.md: \"Every administrator's change publishes AdminActionPerformed\"); what its delivery writes (a device the push "
                    + "service answers 404 or 410 for removed, failuresInARow, lastDeliveredAt) is the push service's answer, written the same way "
                    + "for every alert (docs/api-contract.md, push/test). Nothing in the request picks a target: it reaches only the administrator's "
                    + "stored subscriptions, each audited when it was subscribed (SUBSCRIBE_PUSH, on a push service's host, PushEndpoint), unlike "
                    + "the audited test e-mail (SEND_TEST_EMAIL, #157), whose request names the mail server, so it is audited as a possible relay",
            "POST /api/admin/donors/devices/current/unlock",
            "checks the password and a code, or a passkey, to unlock the administration's copy on this device, as a sign-in checks them, "
                    + "and \"changes nothing and ends no session … Nothing is logged or audited\" (docs/api-contract.md, unlock); what it writes is "
                    + "the spent code step and the wrong-code count of SecondFactorCodes, or the used passkey challenge, and the copy itself is "
                    + "audited when the device stores it (POST /api/admin/donors/devices/current/administration-copy, STORE_ADMINISTRATION_COPY)");

    static final Map<String, StateProbe> WRITES_THAT_MAY_CHANGE_NOTHING = Map.of(
            "POST /api/admin/donations/donors/{id}/receipts",
            new StateProbe("issuing with unchanged data returns the active receipt and takes no number; every new number is audited as ISSUE_RECEIPT",
                    List.of("issued_receipt", "receipt_image")),
            "POST /api/admin/donations/receipts/yearly",
            new StateProbe("a run whose donors all hold their year's receipt issues nothing; every new number is audited as ISSUE_RECEIPT",
                    List.of("issued_receipt", "receipt_image")),
            "PUT /api/admin/content/about",
            new StateProbe("removing a photo the section no longer shows changes nothing", List.of("content_about", "content_media")),
            "PUT /api/admin/content/donate-band",
            new StateProbe("removing a photo the band no longer shows changes nothing", List.of("content_donate_band", "content_media")),
            "PUT /api/admin/content/media/{id}",
            new StateProbe("placing the focal point a photo already has, or removing one it has not, changes nothing",
                    List.of("content_media")),
            "PUT /api/admin/content/project-order",
            new StateProbe("choosing the order already chosen changes nothing", List.of("content_project_order")),
            "PUT /api/admin/content/news/{id}/look-back-year",
            new StateProbe("setting the year an article already looks back on changes nothing", List.of("content_news")));

    private final ApiTranscriptRecorder recorder;

    public AdministratorWriteAuditHooks(ApiTranscriptRecorder recorder) {
        this.recorder = recorder;
    }

    @After
    public void everyAdministratorWriteWasAudited() {
        assertThat(AdministratorWriteAudits.unaudited(recorder.auditedExchanges(), WRITES_WITHOUT_AN_AUDIT_ENTRY))
                .as("administrator writes under /api/admin/ that answered 2xx and added no admin_action row (security.md: every "
                        + "administrator's change publishes AdminActionPerformed); a handler that is no administrator's change goes into "
                        + "WRITES_WITHOUT_AN_AUDIT_ENTRY with its reason, and one that may change nothing into WRITES_THAT_MAY_CHANGE_NOTHING with "
                        + "the tables whose rows tell whether it did")
                .isEmpty();
    }
}
