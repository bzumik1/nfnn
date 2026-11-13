package cz.novanadeje.app.operations.domain.push;

public record DonorNotifications(boolean gifts, boolean yearlyReceipts) {

    public static final DonorNotifications ALL = new DonorNotifications(true, true);
}
