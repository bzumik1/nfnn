package cz.novanadeje.app.donations.application.receipt;

public enum AdministrationChannel {

    BROWSER,
    CONNECTED_APPLICATION;

    boolean mayReplaceReceipts() {
        return this == BROWSER;
    }

    public boolean mayWithdrawReceipts() {
        return this == BROWSER;
    }

    public boolean mayChangeReportRecipients() {
        return this == BROWSER;
    }
}
