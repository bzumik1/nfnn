package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.MailServer;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record AdminTestEmailRequest(@NotBlank @Size(max = TestEmailRequests.MAX_HOST_LENGTH) @Pattern(regexp = TestEmailRequests.HOST_PATTERN) String host,
                             @Min(1) @Max(65535) int port,
                             @Size(max = TestEmailRequests.MAX_ADDRESS_LENGTH) String username,
                             @Size(max = TestEmailRequests.MAX_PASSWORD_LENGTH) String password,
                             boolean auth,
                             boolean startTls,
                             @NotBlank @Email @Size(max = TestEmailRequests.MAX_ADDRESS_LENGTH) String sender) {

    MailServer toServer() {
        return TestEmailRequests.server(host, port, username, password, auth, startTls);
    }

    boolean typesPassword() {
        return password != null && !password.isBlank();
    }

    @Override
    public String toString() {
        return "AdminTestEmailRequest[" + host + ":" + port + "]";
    }
}
