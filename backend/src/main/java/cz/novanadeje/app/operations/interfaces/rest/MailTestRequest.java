package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.MailServer;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record MailTestRequest(@Size(max = SetupCodeRequest.MAX_CODE_LENGTH) String code,
                       @NotBlank @Size(max = 253) @Pattern(regexp = "[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?") String host,
                       @Min(1) @Max(65535) int port,
                       @Size(max = 254) String username,
                       @Size(max = 500) String password,
                       boolean auth,
                       boolean startTls) {

    MailServer toServer() {
        return new MailServer(host, port, username == null ? "" : username, password == null ? "" : password, auth, startTls);
    }

    @Override
    public String toString() {
        return "MailTestRequest[" + host + ":" + port + "]";
    }
}
