package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.RegisterDonorCommand;
import cz.novanadeje.app.donors.application.UpdateDonorProfileCommand;
import cz.novanadeje.app.shared.domain.DonorType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PrintedInputTest {

    private static final String SPOOFED_NAME = "Jana ‮Nováková​";
    private static final String SPOOFED_STREET = "Krátká­ 3⁦";
    private static final String SPOOFED_CITY = "﻿Most‏";

    @Test
    @DisplayName("Given a registration whose name and address carry invisible characters and decomposed letters, when it becomes a command, then the command holds the text a receipt prints")
    void should_hold_printed_text_when_registration_becomes_command_given_invisible_and_decomposed_characters() {
        RegisterDonorRequest request = new RegisterDonorRequest(DonorType.PERSON, SPOOFED_NAME, null,
                new AddressRequest(SPOOFED_STREET, SPOOFED_CITY, "434 01"), "jana@example.cz", "correct horse battery", "cs", null);

        RegisterDonorCommand command = request.toCommand();

        assertThat(command.name()).isEqualTo("Jana Nováková");
        assertThat(command.street()).isEqualTo("Krátká 3");
        assertThat(command.city()).isEqualTo("Most");
    }

    @Test
    @DisplayName("Given a profile change whose name and address carry invisible characters and decomposed letters, when it becomes a command, then the command holds the text a receipt prints")
    void should_hold_printed_text_when_profile_change_becomes_command_given_invisible_and_decomposed_characters() {
        UpdateDonorProfileRequest request = new UpdateDonorProfileRequest(SPOOFED_NAME,
                new AddressRequest(SPOOFED_STREET, SPOOFED_CITY, "434 01"), "cs");

        UpdateDonorProfileCommand command = request.toCommand();

        assertThat(command.name()).isEqualTo("Jana Nováková");
        assertThat(command.street()).isEqualTo("Krátká 3");
        assertThat(command.city()).isEqualTo("Most");
    }

    @Test
    @DisplayName("Given a profile change without a name or an address, when it becomes a command, then those stay absent")
    void should_keep_absent_values_when_profile_change_becomes_command_given_no_name_or_address() {
        UpdateDonorProfileCommand command = new UpdateDonorProfileRequest(null, null, "en").toCommand();

        assertThat(command.name()).isNull();
        assertThat(command.street()).isNull();
    }
}
