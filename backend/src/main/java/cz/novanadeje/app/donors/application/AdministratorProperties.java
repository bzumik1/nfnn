package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.domain.EmailAddress;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties("app.donors.administrators")
public record AdministratorProperties(List<String> emails) {

    private static final String PREFIX = "app.donors.administrators.";

    public AdministratorProperties {
        emails = emails == null ? List.of() : emails.stream().map(String::strip).filter(value -> !value.isEmpty()).toList();
        for (String email : emails) {
            if (!EmailAddress.isValid(email)) {
                throw new IllegalArgumentException(PREFIX + "emails holds a value that is not an e-mail address");
            }
        }
    }

    public List<EmailAddress> addresses() {
        return emails.stream().map(EmailAddress::new).toList();
    }
}
