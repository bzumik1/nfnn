package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.backup.BackupKeyWordCheck;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWords;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Optional;

record BackupKeyWordRequest(@Min(1) @Max(BackupKeyWords.COUNT) int position, @NotNull @Size(max = BackupKeyWords.MAX_WORD_LENGTH) String word) {

    static List<BackupKeyWordCheck> toChecks(List<BackupKeyWordRequest> words) {
        return Optional.ofNullable(words).orElse(List.of()).stream().map(word -> new BackupKeyWordCheck(word.position(), word.word())).toList();
    }

    @Override
    public String toString() {
        return "BackupKeyWordRequest[position=" + position + ", word=********]";
    }
}
