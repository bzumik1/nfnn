package cz.novanadeje.app.shared.application.seal;

public interface RecordSeals {

    String seal(String purpose, byte[] content);

    SealVerdict check(String purpose, byte[] content, String seal);
}
