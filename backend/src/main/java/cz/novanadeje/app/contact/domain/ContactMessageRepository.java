package cz.novanadeje.app.contact.domain;

import java.time.Instant;

public interface ContactMessageRepository {

    void save(ContactMessage message);

    int deleteReceivedBefore(Instant cutoff);
}
