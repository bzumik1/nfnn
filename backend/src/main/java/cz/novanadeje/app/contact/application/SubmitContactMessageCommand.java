package cz.novanadeje.app.contact.application;

public record SubmitContactMessageCommand(String senderName, String senderEmail, String body) {
}
