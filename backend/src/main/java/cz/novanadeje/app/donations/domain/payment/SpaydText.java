package cz.novanadeje.app.donations.domain.payment;

public record SpaydText(String value) {

    public static final int RECIPIENT_NAME_LENGTH = 35;
    public static final int MESSAGE_LENGTH = 60;

    public static SpaydText recipientName(String text) {
        throw new UnsupportedOperationException("not yet");
    }

    public static SpaydText message(String text) {
        throw new UnsupportedOperationException("not yet");
    }

    public boolean isEmpty() {
        throw new UnsupportedOperationException("not yet");
    }
}
