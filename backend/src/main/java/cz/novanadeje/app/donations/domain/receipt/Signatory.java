package cz.novanadeje.app.donations.domain.receipt;

public record Signatory(String name, String role) {

    public Signatory {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Signatory name is required");
        }
        if (role == null || role.isBlank()) {
            throw new IllegalArgumentException("Signatory role is required");
        }
        name = name.trim();
        role = role.trim();
    }
}
