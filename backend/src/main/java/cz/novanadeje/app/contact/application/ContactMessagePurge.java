package cz.novanadeje.app.contact.application;

import java.time.Instant;

public record ContactMessagePurge(Instant receivedBefore, int deleted) {
}
