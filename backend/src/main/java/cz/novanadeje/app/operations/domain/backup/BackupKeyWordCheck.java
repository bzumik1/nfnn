package cz.novanadeje.app.operations.domain.backup;

public record BackupKeyWordCheck(int position, String word) {

    public BackupKeyWordCheck {
        if (position < 1 || position > BackupKeyWords.COUNT) {
            throw new BackupKeyCheckMismatch();
        }
        word = word == null ? "" : word;
    }

    @Override
    public String toString() {
        return "BackupKeyWordCheck[position=" + position + ", word=********]";
    }
}
