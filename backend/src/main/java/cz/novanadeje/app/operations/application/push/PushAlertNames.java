package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.PushAlerts;

final class PushAlertNames {

    private PushAlertNames() {
    }

    static String describe(PushAlerts alerts) {
        return "import z banky " + onOff(alerts.bankImport()) + ", zálohy " + onOff(alerts.backups()) + ", odesílání e-mailů " + onOff(alerts.mail());
    }

    private static String onOff(boolean on) {
        return on ? "zapnuto" : "vypnuto";
    }
}
