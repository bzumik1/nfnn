package cz.novanadeje.app.donations.infrastructure.persistence;

public final class DonationLocks {

    public static final long PAIRING = PostgresPairingLock.KEY;
    public static final long REPORT_SETTINGS = JpaReportSettingsRepository.CHANGE_LOCK_KEY;

    private DonationLocks() {
    }
}
