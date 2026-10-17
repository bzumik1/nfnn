package cz.novanadeje.app.donors.application;

public record UpdateDonorProfileCommand(
        String name,
        String street,
        String city,
        String postalCode,
        String preferredLocale
) {
}
