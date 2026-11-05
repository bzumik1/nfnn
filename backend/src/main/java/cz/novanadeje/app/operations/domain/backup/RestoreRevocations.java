package cz.novanadeje.app.operations.domain.backup;

public record RestoreRevocations(int sessions, int oneTimeSecrets) {

    public RestoreRevocations {
        if (sessions < 0 || oneTimeSecrets < 0) {
            throw new IllegalArgumentException("A restore revokes no negative number of sessions or one-time secrets");
        }
    }
}
