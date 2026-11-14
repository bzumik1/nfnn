package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DeviceStatusSecretTest {

    @Test
    @DisplayName("Given a secret, when hashed, then the hash is the hex SHA-256 of its ASCII value")
    void should_be_sha256_of_value_when_hashed_given_secret() {
        assertThat(new DeviceStatusSecret("abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_Q").hash())
                .isEqualTo("e9ece91559be7fd208703e2f9fe4f01798349bb1ceec9e21fdea79701d3eb642");
    }
}
