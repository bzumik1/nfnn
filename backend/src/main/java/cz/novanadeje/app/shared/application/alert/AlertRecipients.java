package cz.novanadeje.app.shared.application.alert;

import cz.novanadeje.app.shared.domain.EmailAddress;

import java.util.List;

public interface AlertRecipients {

    List<EmailAddress> emailAddresses();
}
