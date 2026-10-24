package cz.novanadeje.app.operations.application.settings;

public record TestEmail(String sender, String recipient) {

    public TestEmail {
        if (sender == null || sender.isBlank() || recipient == null || recipient.isBlank()) {
            throw new IllegalArgumentException("A test e-mail needs a sender and a recipient");
        }
        sender = sender.strip();
        recipient = recipient.strip();
    }
}
